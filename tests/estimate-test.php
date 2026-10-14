<?php
/**
 * Server-side customer estimate test. Run with any PHP 7.4+:
 *
 *   php tests/estimate-test.php
 *
 * Checks wp-plugin/zipkit-sales-tools/includes/estimate-engine.php against
 * data/catalog.json, the public catalogs, and shipping amounts computed by the
 * rep tool itself (tests/fixtures/shipping-cases.json, from
 * tests/make-shipping-cases.html). Zip points below are TEST-ONLY made-up
 * locations, never shipped.
 */

define( 'ZKST_TEST', 1 );
$root = dirname( __DIR__ );
require $root . '/wp-plugin/zipkit-sales-tools/includes/estimate-engine.php';

function load( $p ) { return json_decode( file_get_contents( $p ), true ); }
$cat = load( $root . '/data/catalog.json' );
$zk  = load( $root . '/data/catalog-public-zipkit.json' );
$mvp = load( $root . '/data/catalog-public-mvp.json' );

$results = array();
function rec( $name, $pass, $detail = null ) {
	global $results;
	$results[] = array( $name, (bool) $pass, $pass ? null : $detail );
}
function product( $cat, $id ) { foreach ( $cat['products'] as $p ) { if ( $p['id'] === $id ) { return $p; } } return null; }

// 1. Shipping per home matches the rep tool's own math, case by case.
$cases = load( __DIR__ . '/fixtures/shipping-cases.json' )['cases'];
$bad   = array();
foreach ( $cases as $c ) {
	$got = zkst_est_ship_per( $cat, product( $cat, $c['product_id'] ), $c['miles'] ) * $c['units'];
	if ( abs( $got - $c['shipping'] ) > 0.001 ) { $bad[] = $c + array( 'php' => $got ); }
}
rec( 'Shipping matches the rep tool for ' . count( $cases ) . ' cases (kits, modular, garages incl. over 600 mi, hangars)', ! $bad, $bad );

// 2. Today's data: national starting price, no zone, shipping quoted separately.
$e = zkst_estimate( $cat, $zk, 'zipkit', array( 'product_id' => 'alpine', 'homes' => 2, 'snow' => 'tier1', 'assembly' => 'crew', 'state' => 'UT', 'zip' => '84101' ) );
$alpine = null; foreach ( $zk['products'] as $p ) { if ( 'alpine' === $p['id'] ) { $alpine = $p; } }
rec( 'Zip Kit Alpine x2 in Utah: starting price x 2, no zone (not set), shipping quoted separately',
	$e['start'] === $alpine['start_price'] * 2 && null === $e['zone'] && null === $e['shipping'] && in_array( array( 'Shipping to your build site', 'Quoted separately' ), $e['lines'], true ), $e );
rec( 'Design line and "final pricing is set after design" are in the notes', in_array( 'Design starts at $2,500.', $e['notes'], true ) && in_array( 'Final pricing is set after design.', $e['notes'], true ), $e['notes'] );

// 3. MVP pilot: no prices anywhere.
$m = zkst_estimate( $cat, $mvp, 'mvp', array( 'product_id' => 'sierra', 'homes' => 1, 'snow' => 'standard', 'state' => 'ID', 'zip' => '83401' ) );
rec( 'MVP Sierra: needs_price, no number anywhere, "Price coming soon"',
	$m['needs_price'] && null === $m['start'] && null === $m['each'] && ! preg_match( '/\$\d/', json_encode( $m ) ) && 'Price coming soon' === $m['lines'][0][1], $m );

// 4. With zones, road factor and zip points filled in (TEST VALUES ONLY).
$t = $cat;
$t['public']['location']['road_factor'] = 1.2;
foreach ( $t['public']['location']['zones'] as &$z ) { if ( 'core_modular' === $z['id'] ) { $z['adjust']['zipkit'] = array( 'pct' => 5 ); } if ( 'rest' === $z['id'] ) { $z['adjust']['zipkit'] = array( 'flat' => 3000 ); } }
unset( $z );
$t['public']['location']['state_overrides'] = array( 'MT' => array( 'zipkit' => array( 'flat' => -1000 ) ) );
$zipdata = array( '84721' => array( 37.68, -113.06 ), '00001' => array( 40.76, -111.89 ), '00002' => array( 32.78, -96.80 ) );

$u = zkst_estimate( $t, $zk, 'zipkit', array( 'product_id' => 'alpine', 'homes' => 2, 'snow' => 'standard', 'assembly' => 'diy', 'state' => 'UT', 'zip' => '00001' ), $zipdata );
$each  = $alpine['start_price'] + (int) round( $alpine['start_price'] * 0.05 );
$miles = (int) round( zkst_est_haversine( $zipdata['84721'], $zipdata['00001'] ) * 1.2 );
$ship  = (int) round( $miles * product( $cat, 'alpine' )['pricing']['zipkit']['ship_per_mile'] * 2 );
rec( 'Zone +5% and zip shipping: each = start + 5%, shipping = road miles x rate x 2, total adds up',
	$u['each'] === $each && $u['shipping'] === $ship && $u['start'] === $each * 2 + $ship && 'Utah, Idaho, Montana, Wyoming' === $u['zone'], array( $u, $each, $ship, $miles ) );
$x = zkst_estimate( $t, $zk, 'zipkit', array( 'product_id' => 'hangar-80-x-60', 'state' => 'TX', 'zip' => '00002' ), $zipdata );
rec( '"All other states" zone (Texas) uses its flat amount', $x['each'] === product( $cat, 'hangar-80-x-60' )['pricing']['zksteel']['kit'] + 3000, $x );
$o = zkst_estimate( $t, $zk, 'zipkit', array( 'product_id' => 'alpine', 'homes' => 1, 'snow' => 'standard', 'state' => 'MT', 'zip' => '' ), $zipdata );
rec( 'A state override beats its zone (Montana flat -1,000), and no zip means no shipping number', $o['each'] === $alpine['start_price'] - 1000 && null === $o['shipping'], $o );
$n = zkst_estimate( $t, $zk, 'zipkit', array( 'product_id' => 'alpine', 'homes' => 1, 'snow' => 'standard', 'state' => 'UT', 'zip' => '99999' ), $zipdata );
rec( 'Unknown zip: shipping quoted separately, never guessed', null === $n['shipping'] && in_array( array( 'Shipping to your build site', 'Quoted separately' ), $n['lines'], true ), $n );

// 5. City-cost hook: an add-on line when provided, nothing otherwise.
$c = zkst_estimate( $cat, $zk, 'zipkit', array( 'product_id' => 'alpine', 'homes' => 1, 'snow' => 'standard', 'state' => 'UT', 'zip' => '84101' ), null, array( 'label' => 'Local building costs', 'amount' => 1234 ) );
rec( 'City-cost hook adds its line and amount', $c['start'] === $alpine['start_price'] + 1234 && in_array( array( 'Local building costs', '$1,234' ), $c['lines'], true ), $c );

// 6. Homes are capped and products must exist in the brand's public catalog.
$h = zkst_estimate( $cat, $zk, 'zipkit', array( 'product_id' => 'alpine', 'homes' => 500, 'state' => 'UT' ) );
rec( 'Homes are capped at the public maximum', $h['units'] === $zk['max_homes'], $h['units'] );
rec( 'A model from another brand is refused', false === zkst_estimate( $cat, $zk, 'zipkit', array( 'product_id' => 'sierra' ) )['ok'], null );

$fail = 0;
foreach ( $results as $r ) {
	echo ( $r[1] ? 'PASS  ' : 'FAIL  ' ) . $r[0] . PHP_EOL;
	if ( ! $r[1] ) { $fail++; echo '      ' . substr( json_encode( $r[2] ), 0, 600 ) . PHP_EOL; }
}
echo PHP_EOL . ( $fail ? 'FAIL' : 'PASS' ) . ' ' . ( count( $results ) - $fail ) . '/' . count( $results ) . PHP_EOL;
exit( $fail ? 1 : 0 );
