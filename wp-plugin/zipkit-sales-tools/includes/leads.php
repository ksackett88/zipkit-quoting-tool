<?php
/**
 * POST /wp-json/zipkit/v1/lead: a lead from "Quote your own project".
 *
 * 1. Spam: a filled-in hidden field, or a form sent within 3 seconds, gets a
 *    normal "ok" but nothing is sent. Each visitor (by IP) may send 5 an hour;
 *    the whole site 60 an hour.
 * 2. Every field is checked and trimmed. The estimate is recomputed here from
 *    the public catalog; the browser's number is never trusted.
 * 3. The lead is emailed to the lead address (default sales@zipkithomes.com)
 *    and, once the SQL is run and the setting is on, saved to Supabase
 *    (sql/2026-10_public_leads.sql). Nothing is stored in WordPress.
 *    Later: leads may go straight into Pipedrive.
 */

defined( 'ABSPATH' ) || exit;

const ZKST_LEAD_STATES    = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY';
const ZKST_LEAD_TIMELINES = array( 'As soon as I can', 'In the next 6 months', '6 to 12 months from now', 'More than a year out', 'Just looking for now' );

add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'zipkit/v1',
			'/lead',
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true', // Public form; protected by the checks below.
				'callback'            => 'zkst_lead_submit',
			)
		);
	}
);

/** Count a hit against a limit. True when the limit is already reached. */
function zkst_lead_limited( $key, $max ) {
	$hits = get_transient( $key );
	$hits = is_array( $hits ) ? array_filter( $hits, function ( $t ) { return $t > time() - HOUR_IN_SECONDS; } ) : array();
	if ( count( $hits ) >= $max ) {
		return true;
	}
	$hits[] = time();
	set_transient( $key, array_values( $hits ), HOUR_IN_SECONDS );
	return false;
}

/** The public catalog the customer saw, for recomputing the estimate. */
function zkst_public_catalog() {
	$file = ZKST_DIR . 'app/data/catalog-public.json';
	$data = is_readable( $file ) ? json_decode( (string) file_get_contents( $file ), true ) : null; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
	return is_array( $data ) ? $data : null;
}

function zkst_lead_submit( WP_REST_Request $req ) {
	$d = $req->get_json_params();
	if ( ! is_array( $d ) ) {
		return new WP_Error( 'zkst_bad_lead', 'Bad request.', array( 'status' => 400 ) );
	}

	// 1. Spam: look like it worked, send nothing.
	if ( ! empty( $d['website'] ) || ( isset( $d['elapsed_ms'] ) && (int) $d['elapsed_ms'] < 3000 ) ) {
		return array( 'ok' => true );
	}
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	if ( zkst_lead_limited( 'zkst_lead_ip_' . md5( wp_salt( 'nonce' ) . $ip ), 5 ) || zkst_lead_limited( 'zkst_lead_all', 60 ) ) {
		return new WP_Error( 'zkst_lead_limit', 'Too many requests. Please call us instead.', array( 'status' => 429 ) );
	}

	// 2. Check every field.
	$s    = function ( $k, $max ) use ( $d ) { return isset( $d[ $k ] ) ? mb_substr( sanitize_text_field( (string) $d[ $k ] ), 0, $max ) : ''; };
	$lead = array(
		'name'         => $s( 'name', 100 ),
		'email'        => sanitize_email( isset( $d['email'] ) ? (string) $d['email'] : '' ),
		'phone'        => $s( 'phone', 30 ),
		'timeline'     => $s( 'timeline', 60 ),
		'state'        => strtoupper( $s( 'state', 2 ) ),
		'product_type' => $s( 'product_type', 20 ),
		'product_id'   => $s( 'product_id', 60 ),
		'product_name' => '',
		'homes'        => null,
		'snow'         => in_array( $s( 'snow', 20 ), array( 'standard', 'tier1', 'tier2' ), true ) ? $s( 'snow', 20 ) : null,
		'assembly'     => in_array( $s( 'assembly', 20 ), array( 'crew', 'diy' ), true ) ? $s( 'assembly', 20 ) : null,
		'estimate_start' => null,
		'page'         => esc_url_raw( isset( $d['page'] ) ? (string) $d['page'] : '' ),
	);
	$errors = array();
	if ( '' === $lead['name'] ) { $errors[] = 'name'; }
	if ( ! is_email( $lead['email'] ) ) { $errors[] = 'email'; }
	if ( strlen( preg_replace( '/\D/', '', $lead['phone'] ) ) < 10 ) { $errors[] = 'phone'; }
	if ( ! in_array( $lead['timeline'], ZKST_LEAD_TIMELINES, true ) ) { $errors[] = 'timeline'; }
	if ( ! in_array( $lead['state'], explode( ' ', ZKST_LEAD_STATES ), true ) ) { $errors[] = 'state'; }

	// The model and estimate come from the public catalog, not the browser.
	$cat = zkst_public_catalog();
	if ( $cat ) {
		$types = wp_list_pluck( $cat['types'], 'label', 'id' );
		if ( ! isset( $types[ $lead['product_type'] ] ) ) {
			$errors[] = 'product_type';
		} else {
			$lead['product_name'] = $types[ $lead['product_type'] ];
			foreach ( $cat['products'] as $p ) {
				if ( $p['id'] === $lead['product_id'] && $p['type'] === $lead['product_type'] ) {
					$homes                  = isset( $d['homes'] ) ? max( 1, min( (int) $cat['max_homes'], (int) $d['homes'] ) ) : 1;
					$lead['product_name']   = $p['name'];
					$lead['homes']          = $homes;
					$lead['estimate_start'] = $p['start_price'] * $homes;
				}
			}
			if ( null === $lead['estimate_start'] ) {
				$lead['product_id'] = '';
			}
		}
	}
	if ( $errors ) {
		return new WP_Error( 'zkst_lead_invalid', 'Please check: ' . implode( ', ', $errors ) . '.', array( 'status' => 400 ) );
	}

	// 3. Email, and Supabase when switched on.
	$mailed = zkst_lead_email( $lead );
	$saved  = zkst_settings()['save_leads'] ? zkst_lead_to_supabase( $lead ) : false;
	if ( ! $mailed && ! $saved ) {
		return new WP_Error( 'zkst_lead_failed', 'The lead could not be sent.', array( 'status' => 500 ) );
	}
	return array( 'ok' => true );
}

function zkst_lead_email( $lead ) {
	$to      = zkst_settings()['lead_email'];
	$snow    = array( 'standard' => 'Normal', 'tier1' => 'Heavy', 'tier2' => 'Very heavy' );
	$subject = sprintf( 'New quote lead: %s, %s, %s', $lead['name'], $lead['product_name'] ? $lead['product_name'] : 'no model', $lead['state'] );
	$lines   = array(
		'A customer used "Quote your own project". Vet before quoting.',
		'',
		'Name:      ' . $lead['name'],
		'Email:     ' . $lead['email'],
		'Phone:     ' . $lead['phone'],
		'Timeline:  ' . $lead['timeline'],
		'Building in: ' . $lead['state'],
		'',
		'Looking at: ' . $lead['product_name'] . ( $lead['homes'] > 1 ? ' x ' . $lead['homes'] : '' ),
		'Snow:      ' . ( $lead['snow'] ? $snow[ $lead['snow'] ] : '(not asked)' ),
		'Assembly:  ' . ( $lead['assembly'] ? ( 'crew' === $lead['assembly'] ? 'Wants our crew' : 'DIY' ) : '(not offered)' ),
		'Shown:     ' . ( null !== $lead['estimate_start'] ? 'Starting at $' . number_format( $lead['estimate_start'] ) : 'No price (priced per project)' ),
		'',
		'Page: ' . $lead['page'],
	);
	$headers = array( 'Reply-To: ' . $lead['name'] . ' <' . $lead['email'] . '>' );
	return (bool) wp_mail( $to, $subject, implode( "\n", $lines ), $headers );
}

/** Supabase URL and publishable key: settings first, else the tool's defaults. */
function zkst_supabase_target() {
	$s   = zkst_settings();
	$url = $s['supabase_url'];
	$key = $s['supabase_key'];
	if ( '' === $url || '' === $key ) {
		$js = (string) @file_get_contents( ZKST_DIR . 'app/lib/supabase.js' ); // phpcs:ignore
		if ( '' === $url && preg_match( "/SUPABASE_URL\s*=\s*CFG\.supabaseUrl \|\| '([^']+)'/", $js, $m ) ) { $url = $m[1]; }
		if ( '' === $key && preg_match( "/SUPABASE_PUB_KEY\s*=\s*CFG\.supabaseKey \|\| '([^']+)'/", $js, $m ) ) { $key = $m[1]; }
	}
	return array( $url, $key );
}

function zkst_lead_to_supabase( $lead ) {
	list( $url, $key ) = zkst_supabase_target();
	if ( ! $url || ! $key ) {
		return false;
	}
	$res = wp_remote_post(
		untrailingslashit( $url ) . '/rest/v1/rpc/submit_public_lead',
		array(
			'timeout' => 8,
			'headers' => array( 'apikey' => $key, 'Content-Type' => 'application/json' ),
			'body'    => wp_json_encode( array( 'lead' => $lead ) ),
		)
	);
	return ! is_wp_error( $res ) && wp_remote_retrieve_response_code( $res ) < 300;
}
