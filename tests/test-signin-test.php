<?php
/**
 * Test sign-in guard (includes/customers.php): a "zkst-test." token is only
 * ever accepted on a local site with the setting on. No WordPress needed.
 *
 *   php -n tests/test-signin-test.php
 */
define( 'ABSPATH', __DIR__ );
$GLOBALS['t_home'] = 'http://mvp.local';
$GLOBALS['t_env']  = 'local';
$GLOBALS['t_on']   = true;
$GLOBALS['t_filters'] = array();
function add_filter( $name, $fn ) { $GLOBALS['t_filters'][ $name ][] = $fn; }
function home_url() { return $GLOBALS['t_home']; }
function wp_parse_url( $u, $c ) { return parse_url( $u, $c ); }
function wp_get_environment_type() { return $GLOBALS['t_env']; }
function zkst_settings() { return array( 'test_signin' => $GLOBALS['t_on'] ); }
function sanitize_email( $e ) { return trim( $e ); }
function is_email( $e ) { return (bool) filter_var( $e, FILTER_VALIDATE_EMAIL ); }
function sanitize_text_field( $s ) { return trim( strip_tags( $s ) ); }
if ( ! function_exists( 'mb_substr' ) ) { function mb_substr( $s, $a, $b ) { return substr( $s, $a, $b ); } } // WordPress polyfills this too.
require dirname( __DIR__ ) . '/wp-plugin/zipkit-sales-tools/includes/customers.php';

$results = array();
function rec( $name, $pass ) { $GLOBALS['results'][] = array( $name, (bool) $pass ); }
function verify( $token ) { return $GLOBALS['t_filters']['zkst_verify_customer_token'][0]( null, $token ); }
function token( $d ) { return 'zkst-test.' . rtrim( strtr( base64_encode( json_encode( $d ) ), '+/', '-_' ), '=' ); }
$tok = token( array( 'email' => 'pat@example.test', 'name' => 'Pat Buyer', 'phone' => '435-555-0100', 'zip' => '84101' ) );

$u = verify( $tok );
rec( 'Local site (mvp.local, local mode, setting on): test token signs in as that email, confirmed, marked test', 'pat@example.test' === $u['email'] && $u['confirmed'] && $u['test'] && 'Pat Buyer' === $u['name'] );
rec( 'A real Supabase token is passed on to Supabase (filter answers nothing)', null === verify( 'eyJhbGciOi.real.token' ) );
rec( 'Bad test token (no valid email) is refused', empty( verify( 'zkst-test.bm9wZQ' )['confirmed'] ) );

foreach ( array(
	array( 'https://mountainvalleyprefab.com', 'local', true, 'Live address' ),
	array( 'https://staging.mountainvalleyprefab.com', 'staging', true, 'Staging address' ),
	array( 'http://mvp.local', 'production', true, 'Local address but production mode' ),
	array( 'https://mvp.local.example.com', 'local', true, 'Address that only contains ".local"' ),
	array( 'http://mvp.local', 'local', false, 'Local site with the setting off' ),
) as $c ) {
	list( $GLOBALS['t_home'], $GLOBALS['t_env'], $GLOBALS['t_on'], $label ) = $c;
	rec( $label . ': test token refused', empty( verify( $tok )['confirmed'] ) && ! zkst_test_signin() );
}

$ok = 0;
foreach ( $results as $r ) { echo ( $r[1] ? 'PASS  ' : 'FAIL  ' ) . $r[0] . "\n"; $ok += $r[1] ? 1 : 0; }
echo "\n" . ( $ok === count( $results ) ? 'PASS' : 'FAIL' ) . " $ok/" . count( $results ) . "\n";
exit( $ok === count( $results ) ? 0 : 1 );
