<?php
/**
 * Customer accounts for the customer quoter.
 *
 * Customers sign up in the browser with their own Supabase project (the
 * "customer" project in Zip Kit Tools settings; recommended: separate from
 * the sales project, so customers never touch saved projects or payments).
 * Signing in is by an email link, so every account has a verified email.
 *
 * The plugin's estimate and lead endpoints only answer a signed-in customer:
 * the browser sends its Supabase access token, and zkst_customer() checks it
 * with Supabase (cached for 10 minutes) and requires a confirmed email.
 */

defined( 'ABSPATH' ) || exit;

/** Customer project URL and publishable key (blank = not set up yet). */
function zkst_customer_target() {
	$s = zkst_settings();
	return array( $s['customer_supabase_url'], $s['customer_supabase_key'] );
}

/**
 * The signed-in customer for a request, or a WP_Error.
 * Returns ['id', 'email', 'name', 'phone', 'zip', 'token'].
 *
 * Tests (and a future single sign-on) can answer first through the
 * 'zkst_verify_customer_token' filter.
 */
function zkst_customer( WP_REST_Request $req ) {
	$auth = (string) $req->get_header( 'authorization' );
	if ( ! preg_match( '/^Bearer\s+(\S+)$/i', $auth, $m ) ) {
		return new WP_Error( 'zkst_signin', 'Please sign in first.', array( 'status' => 401 ) );
	}
	$token = $m[1];

	$user = apply_filters( 'zkst_verify_customer_token', null, $token );
	if ( null === $user ) {
		$cache = 'zkst_cust_' . md5( $token );
		$user  = get_transient( $cache );
		if ( false === $user ) {
			list( $url, $key ) = zkst_customer_target();
			if ( ! $url || ! $key ) {
				return new WP_Error( 'zkst_no_accounts', 'Customer accounts are not set up yet.', array( 'status' => 503 ) );
			}
			$res = wp_remote_get(
				untrailingslashit( $url ) . '/auth/v1/user',
				array( 'timeout' => 8, 'headers' => array( 'apikey' => $key, 'Authorization' => 'Bearer ' . $token ) )
			);
			if ( is_wp_error( $res ) || 200 !== wp_remote_retrieve_response_code( $res ) ) {
				return new WP_Error( 'zkst_signin', 'Please sign in again.', array( 'status' => 401 ) );
			}
			$u    = json_decode( wp_remote_retrieve_body( $res ), true );
			$meta = isset( $u['user_metadata'] ) && is_array( $u['user_metadata'] ) ? $u['user_metadata'] : array();
			$user = array(
				'id'        => isset( $u['id'] ) ? (string) $u['id'] : '',
				'email'     => isset( $u['email'] ) ? (string) $u['email'] : '',
				'confirmed' => ! empty( $u['email_confirmed_at'] ),
				'name'      => isset( $meta['name'] ) ? (string) $meta['name'] : '',
				'phone'     => isset( $meta['phone'] ) ? (string) $meta['phone'] : '',
				'zip'       => isset( $meta['zip'] ) ? (string) $meta['zip'] : '',
			);
			set_transient( $cache, $user, 10 * MINUTE_IN_SECONDS );
		}
	}
	if ( empty( $user['id'] ) || empty( $user['confirmed'] ) ) {
		return new WP_Error( 'zkst_verify', 'Please confirm your email first.', array( 'status' => 403 ) );
	}
	$user['token'] = $token;
	return $user;
}

/** Count a hit against a limit. True when the limit is already reached. */
function zkst_limited( $key, $max ) {
	$hits = get_transient( $key );
	$hits = is_array( $hits ) ? array_filter( $hits, function ( $t ) { return $t > time() - HOUR_IN_SECONDS; } ) : array();
	if ( count( $hits ) >= $max ) {
		return true;
	}
	$hits[] = time();
	set_transient( $key, array_values( $hits ), HOUR_IN_SECONDS );
	return false;
}

/**
 * Test sign-in, for trying the customer flow before the customer Supabase
 * project exists. Only ever on a local site: WordPress in "local" or
 * "development" mode AND a localhost, .local, .test or .localhost address.
 * Anywhere else the setting does nothing.
 */
function zkst_is_local_site() {
	$host = (string) wp_parse_url( home_url(), PHP_URL_HOST );
	$env  = function_exists( 'wp_get_environment_type' ) ? wp_get_environment_type() : 'production';
	return in_array( $env, array( 'local', 'development' ), true )
		&& ( in_array( $host, array( 'localhost', '127.0.0.1' ), true ) || (bool) preg_match( '/\.(local|test|localhost)$/', $host ) );
}
function zkst_test_signin() {
	return ! empty( zkst_settings()['test_signin'] ) && zkst_is_local_site();
}

// A test token is "zkst-test." + base64url of {email, name, phone, zip},
// made by the page's test sign-in. Answered here, before Supabase is asked.
add_filter(
	'zkst_verify_customer_token',
	function ( $user, $token ) {
		if ( null !== $user || 0 !== strpos( $token, 'zkst-test.' ) ) {
			return $user;
		}
		if ( ! zkst_test_signin() ) {
			return array( 'id' => '', 'confirmed' => false );
		}
		$d = json_decode( (string) base64_decode( strtr( substr( $token, 10 ), '-_', '+/' ) ), true );
		$d = is_array( $d ) ? $d : array();
		$email = isset( $d['email'] ) ? sanitize_email( $d['email'] ) : '';
		if ( ! is_email( $email ) ) {
			return array( 'id' => '', 'confirmed' => false );
		}
		$t = function ( $k ) use ( $d ) { return isset( $d[ $k ] ) ? mb_substr( sanitize_text_field( (string) $d[ $k ] ), 0, 100 ) : ''; };
		return array( 'id' => 'test-' . md5( $email ), 'email' => $email, 'confirmed' => true, 'name' => $t( 'name' ), 'phone' => $t( 'phone' ), 'zip' => $t( 'zip' ), 'test' => true );
	},
	5,
	2
);
