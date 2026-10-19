<?php
/**
 * Lead email helpers (includes/leads.php): the From line, the UTM line and
 * the brand's own scope wording. No WordPress needed.
 *
 *   php -n tests/lead-email-test.php
 */
define( 'ABSPATH', __DIR__ );
$GLOBALS['t_from'] = '';
function add_action() {}
function add_filter() {}
function zkst_settings() { return array( 'from_email' => $GLOBALS['t_from'] ); }
function network_home_url() { return 'https://www.mountainvalleyprefab.com/'; }
function wp_parse_url( $u, $c ) { return parse_url( $u, $c ); }
require dirname( __DIR__ ) . '/wp-plugin/zipkit-sales-tools/includes/leads.php';

$results = array();
function rec( $name, $pass, $got = null ) { $GLOBALS['results'][] = array( $name . ( $pass ? '' : '  got: ' . json_encode( $got ) ), (bool) $pass ); }
$mvp = json_decode( file_get_contents( dirname( __DIR__ ) . '/data/catalog-public-mvp.json' ), true );
$zk  = json_decode( file_get_contents( dirname( __DIR__ ) . '/data/catalog-public-zipkit.json' ), true );

$f = zkst_lead_from( $mvp );
rec( 'From is the brand name at WordPress\'s usual address when "Send emails from" is blank', 'From: "Mountain Valley Prefab" <wordpress@mountainvalleyprefab.com>' === $f, $f );
$GLOBALS['t_from'] = 'website@mountainvalleyprefab.com';
$f = zkst_lead_from( $mvp );
rec( 'From uses the "Send emails from" address when set', 'From: "Mountain Valley Prefab" <website@mountainvalleyprefab.com>' === $f, $f );
rec( 'UTM line says "none" with no tags', 'none' === zkst_lead_utm_text( array( 'utm_source' => '', 'utm_medium' => '', 'utm_campaign' => '' ) ) );
rec( 'UTM line lists only the tags it has', 'google / pilot' === zkst_lead_utm_text( array( 'utm_source' => 'google', 'utm_medium' => '', 'utm_campaign' => 'pilot' ) ) );
$fp = zkst_fine_print( 'modular', $mvp );
rec( 'MVP fine print uses MVP\'s scope (our crew sets it; you provide the crane)', $mvp['scope']['modular'] === $fp[0] && false !== strpos( $fp[0], 'by our crew' ), $fp[0] );
$fz = zkst_fine_print( 'modular', $zk );
rec( 'Zip Kit fine print keeps its own modular wording', 0 === strpos( $fz[0], 'A complete modular home arrives finished inside.' ), $fz[0] );
rec( '"Final pricing is set after design" is not repeated in the fine print', ! preg_grep( '/Final pricing/', $fp ), $fp );

$ok = 0;
foreach ( $results as $r ) { echo ( $r[1] ? 'PASS  ' : 'FAIL  ' ) . $r[0] . "\n"; $ok += $r[1] ? 1 : 0; }
echo "\n" . ( $ok === count( $results ) ? 'PASS' : 'FAIL' ) . " $ok/" . count( $results ) . "\n";
exit( $ok === count( $results ) ? 0 : 1 );
