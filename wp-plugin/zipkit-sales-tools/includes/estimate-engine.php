<?php
/**
 * Customer estimate math. Server-side only; plain PHP with no WordPress
 * calls, so tests/estimate-test.php can run it directly.
 *
 * Starting price, size, design line: from the brand's PUBLIC catalog (made by
 *   data/build-public-catalog.ps1), so the page and the server agree.
 * Price zone: catalog.json public.location.zones, per brand. A zone or state
 *   adjustment is {"pct": n} or {"flat": n} per home; needs_price adds nothing.
 * Shipping: road miles from the brand's factory zip to the customer's zip,
 *   times the rep tool's per-mile rate (same formulas as js/pricing.js),
 *   times the number of homes. Needs zip data, a factory zip and a road
 *   factor; if any is missing, shipping is "quoted separately".
 * City cost: an optional add-on line passed in by the caller (hook only).
 *
 * Nothing marked needs_price / needs_data is ever guessed.
 */

if ( ! defined( 'ABSPATH' ) && ! defined( 'ZKST_TEST' ) ) {
	exit;
}

/** Follow "a.b.c" inside an array. */
function zkst_est_ref( $arr, $path ) {
	foreach ( explode( '.', $path ) as $k ) {
		if ( ! is_array( $arr ) || ! array_key_exists( $k, $arr ) ) {
			return null;
		}
		$arr = $arr[ $k ];
	}
	return $arr;
}

function zkst_est_missing( $v ) {
	return null === $v || 'needs_price' === $v || 'needs_data' === $v || '' === $v;
}

function zkst_est_money( $n ) {
	return '$' . number_format( (float) $n );
}

/** "2 buildings × 3 units = 6 units" (the public quoter shows the same). */
function zkst_est_buildings( $buildings, $per ) {
	$n = $buildings * $per;
	return $buildings . ' building' . ( 1 === $buildings ? '' : 's' ) . ' × ' . $per . ' unit' . ( 1 === $per ? '' : 's' ) . ' = ' . $n . ' unit' . ( 1 === $n ? '' : 's' );
}

/** The price zone for a state ("rest" catches every state not listed elsewhere). */
function zkst_est_zone( $cat, $state ) {
	$zones = (array) zkst_est_ref( $cat, 'public.location.zones' );
	foreach ( $zones as $z ) {
		if ( is_array( $z['states'] ) && in_array( $state, $z['states'], true ) ) {
			return $z;
		}
	}
	foreach ( $zones as $z ) {
		if ( 'rest' === $z['states'] ) {
			return $z;
		}
	}
	return null;
}

/** Per-home adjustment for this brand and state, or null when not set. */
function zkst_est_adjust( $cat, $brand, $state, $each ) {
	$over = zkst_est_ref( $cat, 'public.location.state_overrides.' . $state . '.' . $brand );
	$zone = zkst_est_zone( $cat, $state );
	$rule = ! zkst_est_missing( $over ) ? $over : ( $zone ? zkst_est_ref( $zone, 'adjust.' . $brand ) : null );
	if ( zkst_est_missing( $rule ) || ! is_array( $rule ) ) {
		return null;
	}
	if ( isset( $rule['pct'] ) ) {
		return (int) round( $each * $rule['pct'] / 100 );
	}
	if ( isset( $rule['flat'] ) ) {
		return (int) round( $rule['flat'] );
	}
	return null;
}

/** Straight-line miles between two [lat, lon] points. */
function zkst_est_haversine( $a, $b ) {
	$r    = 3958.8;
	$dlat = deg2rad( $b[0] - $a[0] );
	$dlon = deg2rad( $b[1] - $a[1] );
	$h    = sin( $dlat / 2 ) ** 2 + cos( deg2rad( $a[0] ) ) * cos( deg2rad( $b[0] ) ) * sin( $dlon / 2 ) ** 2;
	return 2 * $r * asin( min( 1, sqrt( $h ) ) );
}

/** Road miles from the brand's factory to a zip, or null when any input is missing. */
function zkst_est_miles( $cat, $brand, $zip, $zipdata ) {
	$factory = zkst_est_ref( $cat, 'public.brands.' . $brand . '.factory_zip' );
	$road    = zkst_est_ref( $cat, 'public.location.road_factor' );
	if ( zkst_est_missing( $factory ) || zkst_est_missing( $road ) || ! is_array( $zipdata ) ) {
		return null;
	}
	if ( empty( $zipdata[ $factory ] ) || empty( $zipdata[ $zip ] ) ) {
		return null;
	}
	return (int) round( zkst_est_haversine( $zipdata[ $factory ], $zipdata[ $zip ] ) * $road );
}

/**
 * Shipping per home for a product over $miles, mirroring js/pricing.js:
 * kits: product ship_per_mile; modular: high end of the product's range;
 * standalone garage: type rate (over-600-mile rate past 600); hangar: type rate.
 */
function zkst_est_ship_per( $cat, $product, $miles ) {
	$z = zkst_est_ref( $product, 'pricing.' . $product['brands'][0] );
	$t = zkst_est_ref( $cat, 'product_types.' . $product['type'] );
	switch ( $product['type'] ) {
		case 'shell':
			$rate = zkst_est_ref( $z, 'ship_per_mile' );
			break;
		case 'modular':
			$rate = zkst_est_ref( $z, 'ship_per_mile.high' );
			break;
		case 'garage':
			$rate = zkst_est_ref( $t, $miles > 600 ? 'ship_per_mile.standalone_over_600_miles' : 'ship_per_mile.standalone' );
			break;
		case 'hangar':
			$rate = zkst_est_ref( $t, 'ship_per_mile' );
			break;
		default:
			$rate = null;
	}
	return is_numeric( $rate ) ? $miles * $rate : null;
}

/**
 * The estimate. $in: product_id, homes (or buildings and building_units), snow, assembly, state, zip.
 * $city: optional ['label' => string, 'amount' => number] from the city-cost hook.
 * Returns ['ok' => false, 'error' => ...] or the estimate.
 */
function zkst_estimate( $cat, $public, $brand, $in, $zipdata = null, $city = null ) {
	$pub = null;
	foreach ( (array) $public['products'] as $p ) {
		if ( $p['id'] === ( isset( $in['product_id'] ) ? $in['product_id'] : '' ) ) {
			$pub = $p;
		}
	}
	if ( ! $pub ) {
		return array( 'ok' => false, 'error' => 'product' );
	}
	$type = null;
	foreach ( (array) $public['types'] as $t ) {
		if ( $t['id'] === $pub['type'] ) {
			$type = $t;
		}
	}
	// The catalog product behind this model (for shipping rates), and only
	// when it belongs to this brand: a brand never borrows another's rates.
	$src = $pub['id'];
	foreach ( (array) zkst_est_ref( $cat, 'public.brands.' . $brand . '.models' ) as $m ) {
		if ( $m['id'] === $pub['id'] ) {
			$src = isset( $m['from_product'] ) ? $m['from_product'] : null;
		}
	}
	$own  = (array) zkst_est_ref( $cat, 'public.brands.' . $brand . '.catalog_brands' );
	$full = null;
	foreach ( (array) $cat['products'] as $p ) {
		if ( $src && $p['id'] === $src && in_array( $p['brands'][0], $own, true ) ) {
			$full = $p;
		}
	}
	$state  = isset( $in['state'] ) ? $in['state'] : '';
	$zip    = isset( $in['zip'] ) ? substr( preg_replace( '/\D/', '', (string) $in['zip'] ), 0, 5 ) : '';
	// Multifamily models are asked by the building: units per building (one
	// of the model's sizes) times how many buildings.
	$sizes     = ( $type && $type['ask_homes'] && ! empty( $pub['building_units'] ) ) ? array_map( 'intval', (array) $pub['building_units'] ) : array();
	$per_bldg  = null;
	$buildings = null;
	if ( $sizes ) {
		$per_bldg = 1 === count( $sizes ) ? $sizes[0] : ( isset( $in['building_units'] ) ? (int) $in['building_units'] : 0 );
		if ( ! in_array( $per_bldg, $sizes, true ) ) {
			return array( 'ok' => false, 'error' => 'building_units' );
		}
		$buildings = max( 1, min( (int) $public['max_homes'], (int) ( isset( $in['buildings'] ) ? $in['buildings'] : 1 ) ) );
		$units     = $buildings * $per_bldg;
	} else {
		$units = ( $type && $type['ask_homes'] ) ? max( 1, min( (int) $public['max_homes'], (int) ( isset( $in['homes'] ) ? $in['homes'] : 1 ) ) ) : 1;
	}
	$word   = array( 'home' => 'home', 'garage' => 'garage', 'hangar' => 'hangar' );
	$unit   = $sizes ? 'unit' : ( isset( $word[ $type['per'] ] ) ? $word[ $type['per'] ] : 'home' );
	$units_word = $units . ' ' . $unit . ( 1 === $units ? '' : 's' );

	$res = array(
		'ok'          => true,
		'needs_price' => ! empty( $public['needs_price'] ) || null === $pub['start_price'],
		'product'     => $pub['name'],
		'units'       => $units,
		'buildings'   => $buildings,
		'building_units' => $per_bldg,
		'each'        => null,
		'zone'        => null,
		'shipping'    => null,
		'start'       => null,
		'lines'       => array(),
		'notes'       => array(),
	);
	$name = $pub['name'] . ( $pub['size'] ? ' (' . $pub['size'] . ')' : '' );

	if ( $res['needs_price'] ) {
		$res['lines'][] = array( $name, 'Price coming soon' );
	} else {
		$each = (int) $pub['start_price'];
		$adj  = zkst_est_adjust( $cat, $brand, $state, $each );
		if ( null !== $adj && 0 !== $adj ) {
			$each += $adj;
			$zone  = zkst_est_zone( $cat, $state );
			$res['zone']    = $zone ? $zone['label'] : null;
			$res['notes'][] = 'Includes pricing for your area.';
		}
		$res['each']    = $each;
		$res['lines'][] = array( $name, $units > 1 ? $units_word . ' × ' . zkst_est_money( $each ) : zkst_est_money( $each ) );
	}
	if ( $sizes ) {
		$res['lines'][] = array( 'Buildings', zkst_est_buildings( $buildings, $per_bldg ) );
	}

	if ( $type && $type['ask_snow'] ) {
		$snow = isset( $in['snow'] ) ? $in['snow'] : 'standard';
		$lab  = 'Normal snow';
		foreach ( (array) $public['snow_choices'] as $s ) {
			if ( $s['id'] === $snow ) {
				$lab = $s['label'];
			}
		}
		$res['lines'][] = array( 'Snow load (' . strtolower( preg_replace( '/\s*snow$/i', '', $lab ) ) . ')', 'standard' === $snow ? 'Included' : 'Priced in your quote' );
	}
	if ( isset( $in['assembly'] ) && in_array( $in['assembly'], array( 'crew', 'diy' ), true ) ) {
		$res['lines'][] = 'crew' === $in['assembly'] ? array( 'Assembly by our crew', 'Quoted separately' ) : array( 'You or your own crew build it', 'Plans and instructions included' );
	}
	if ( ! empty( $type['design_line'] ) ) {
		$res['notes'][] = $type['design_line'];
	}

	// Shipping from the zip, when everything it needs is in. A brand set to
	// "quoted_separately" (MVP until Sven sends rates) never shows a number.
	$ship = null;
	$quoted_sep = 'quoted_separately' === zkst_est_ref( $cat, 'public.brands.' . $brand . '.shipping' );
	if ( ! $res['needs_price'] && ! $quoted_sep && $full && preg_match( '/^\d{5}$/', $zip ) ) {
		$miles = zkst_est_miles( $cat, $brand, $zip, $zipdata );
		if ( null !== $miles ) {
			$per = zkst_est_ship_per( $cat, $full, $miles );
			if ( null !== $per ) {
				$ship = (int) round( $per * $units );
			}
		}
	}
	$res['shipping'] = $ship;
	if ( null !== $ship ) {
		$res['notes'][] = 'Shipping is estimated. Your sales rep confirms the final number.';
	}
	$res['lines'][]  = null !== $ship
		? array( 'Shipping to ' . $zip . ' (estimated)', zkst_est_money( $ship ) )
		: array( 'Shipping to your build site', 'Quoted separately' );

	// City cost add-on (hook only; nothing provides one yet).
	$extra = 0;
	if ( ! $res['needs_price'] && is_array( $city ) && isset( $city['label'], $city['amount'] ) && is_numeric( $city['amount'] ) ) {
		$extra          = (int) round( $city['amount'] );
		$res['lines'][] = array( $city['label'], zkst_est_money( $extra ) );
	}

	if ( ! $res['needs_price'] ) {
		$res['start'] = $res['each'] * $units + ( null !== $ship ? $ship : 0 ) + $extra;
	}
	$res['notes'][] = 'Final pricing is set after design.';
	return $res;
}
