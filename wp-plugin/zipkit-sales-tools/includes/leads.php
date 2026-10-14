<?php
/**
 * Customer quoter endpoints. Both need a signed-in customer with a confirmed
 * email (includes/customers.php).
 *
 * POST /wp-json/zipkit/v1/estimate  the estimate for the customer's choices,
 *   figured here (includes/estimate-engine.php) so zone adjustments and
 *   shipping rates never reach the browser.
 * POST /wp-json/zipkit/v1/lead      "send me the breakdown": recomputes the
 *   estimate, emails the brand's sales inbox and the customer, and saves the
 *   quote to the customer's own account in Supabase (customer_quotes).
 *   Leads may go straight into Pipedrive later; hook in after the emails.
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/estimate-engine.php';

const ZKST_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY';

add_action(
	'rest_api_init',
	function () {
		register_rest_route( 'zipkit/v1', '/estimate', array( 'methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => 'zkst_estimate_endpoint' ) );
		register_rest_route( 'zipkit/v1', '/lead', array( 'methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => 'zkst_lead_endpoint' ) );
	}
);

/** Which brand the customer quoter runs as on this site. */
function zkst_public_brand() {
	$b = zkst_settings()['public_brand'];
	return preg_match( '/^[a-z0-9_-]+$/', $b ) ? $b : 'mvp';
}

/** The brand's public catalog (what the page shows). */
function zkst_public_catalog( $brand ) {
	$file = ZKST_DIR . 'app/data/catalog-public-' . $brand . '.json';
	$data = is_readable( $file ) ? json_decode( (string) file_get_contents( $file ), true ) : null; // phpcs:ignore
	return is_array( $data ) ? $data : null;
}

/** Zip code centers ({"84101": [lat, lon], ...}), once a data file is added. */
function zkst_zipdata() {
	$file = ZKST_DIR . 'private/zips.json';
	$data = is_readable( $file ) ? json_decode( (string) file_get_contents( $file ), true ) : null; // phpcs:ignore
	return is_array( $data ) ? $data : null;
}

/** The customer's choices from a request, cleaned. */
function zkst_public_input( $d ) {
	$s = function ( $k, $max ) use ( $d ) { return isset( $d[ $k ] ) ? mb_substr( sanitize_text_field( (string) $d[ $k ] ), 0, $max ) : ''; };
	return array(
		'product_type' => $s( 'product_type', 20 ),
		'product_id'   => $s( 'product_id', 60 ),
		'homes'        => isset( $d['homes'] ) ? (int) $d['homes'] : 1,
		'snow'         => in_array( $s( 'snow', 20 ), array( 'standard', 'tier1', 'tier2' ), true ) ? $s( 'snow', 20 ) : null,
		'assembly'     => in_array( $s( 'assembly', 20 ), array( 'crew', 'diy' ), true ) ? $s( 'assembly', 20 ) : null,
		'state'        => strtoupper( $s( 'state', 2 ) ),
		'zip'          => substr( preg_replace( '/\D/', '', $s( 'zip', 10 ) ), 0, 5 ),
		'timeline'     => $s( 'timeline', 60 ),
	);
}

/** The estimate, with the city-cost hook (nothing answers it yet). */
function zkst_public_estimate( $brand, $in ) {
	$cat = json_decode( (string) zkst_catalog_json(), true );
	$pub = zkst_public_catalog( $brand );
	if ( ! is_array( $cat ) || ! $pub ) {
		return array( 'ok' => false, 'error' => 'catalog' );
	}
	/**
	 * City cost add-on (for example RSMeans), later. Return
	 * ['label' => 'Local building costs', 'amount' => 1234] to add a line.
	 */
	$city = apply_filters( 'zkst_city_cost', null, $in['zip'], $in, $brand );
	return zkst_estimate( $cat, $pub, $brand, $in, zkst_zipdata(), $city );
}

function zkst_estimate_endpoint( WP_REST_Request $req ) {
	$cust = zkst_customer( $req );
	if ( is_wp_error( $cust ) ) {
		return $cust;
	}
	if ( zkst_limited( 'zkst_est_' . md5( $cust['id'] ), 120 ) ) {
		return new WP_Error( 'zkst_limit', 'Too many requests. Try again in a bit.', array( 'status' => 429 ) );
	}
	$in = zkst_public_input( (array) $req->get_json_params() );
	if ( ! in_array( $in['state'], explode( ' ', ZKST_STATES ), true ) ) {
		return new WP_Error( 'zkst_bad', 'Pick your state.', array( 'status' => 400 ) );
	}
	$e = zkst_public_estimate( zkst_public_brand(), $in );
	if ( empty( $e['ok'] ) ) {
		return new WP_Error( 'zkst_bad', 'That model is not available.', array( 'status' => 400 ) );
	}
	return $e;
}

function zkst_lead_endpoint( WP_REST_Request $req ) {
	$d = (array) $req->get_json_params();
	// Spam trap: look like it worked, send nothing.
	if ( ! empty( $d['website'] ) ) {
		return array( 'ok' => true );
	}
	$cust = zkst_customer( $req );
	if ( is_wp_error( $cust ) ) {
		return $cust;
	}
	if ( zkst_limited( 'zkst_lead_' . md5( $cust['id'] ), 5 ) || zkst_limited( 'zkst_lead_all', 60 ) ) {
		return new WP_Error( 'zkst_limit', 'Too many requests. Please call us instead.', array( 'status' => 429 ) );
	}
	$brand = zkst_public_brand();
	$pub   = zkst_public_catalog( $brand );
	$in    = zkst_public_input( $d );
	$errs  = array();
	if ( ! in_array( $in['state'], explode( ' ', ZKST_STATES ), true ) ) { $errs[] = 'state'; }
	if ( ! $pub || ! in_array( $in['timeline'], (array) $pub['timelines'], true ) ) { $errs[] = 'timeline'; }
	$types = $pub ? wp_list_pluck( $pub['types'], 'label', 'id' ) : array();
	if ( ! isset( $types[ $in['product_type'] ] ) ) { $errs[] = 'product_type'; }
	if ( $errs ) {
		return new WP_Error( 'zkst_bad', 'Please check: ' . implode( ', ', $errs ) . '.', array( 'status' => 400 ) );
	}

	$lead_only = false;
	foreach ( $pub['types'] as $t ) { if ( $t['id'] === $in['product_type'] ) { $lead_only = ! empty( $t['lead_only'] ); } }
	$est = $lead_only ? null : zkst_public_estimate( $brand, $in );
	if ( ! $lead_only && empty( $est['ok'] ) ) {
		return new WP_Error( 'zkst_bad', 'That model is not available.', array( 'status' => 400 ) );
	}
	$utm = array();
	foreach ( array( 'utm_source', 'utm_medium', 'utm_campaign', 'landing_page', 'page' ) as $k ) {
		$utm[ $k ] = isset( $d[ $k ] ) ? mb_substr( sanitize_text_field( (string) $d[ $k ] ), 0, 300 ) : '';
	}
	$lead = array(
		'brand'        => $brand,
		'customer'     => $cust,
		'choices'      => $in,
		'product_name' => $est ? $est['product'] : $types[ $in['product_type'] ],
		'estimate'     => $est,
		'utm'          => $utm,
	);

	$sales  = zkst_lead_email_sales( $pub, $lead );
	$copy   = zkst_lead_email_customer( $pub, $lead );
	$saved  = zkst_lead_save( $lead );
	if ( ! $sales && ! $saved ) {
		return new WP_Error( 'zkst_failed', 'That did not go through.', array( 'status' => 500 ) );
	}
	return array( 'ok' => true, 'emailed_you' => (bool) $copy, 'estimate' => $est );
}

/** The fine print, the same on the page, the PDF and the emails. */
function zkst_fine_print( $type ) {
	$scope = 'modular' === $type
		? 'A complete modular home arrives finished inside. Site prep, foundation, setting it on site and utility hookups are not included.'
		: 'Kits are the shell only. Foundation, siding and roofing, insulation, plumbing, electrical and interior finishes are not included.';
	return array(
		$scope,
		'This is an estimate, not a quote. Final pricing is set after design.',
		'Pricing is based on your build site address. Sales tax is not included.',
		'Permits, zoning and what you can build on your land: your local building department can tell you.',
	);
}

function zkst_lead_breakdown_text( $lead ) {
	$out = array();
	if ( $lead['estimate'] ) {
		foreach ( $lead['estimate']['lines'] as $l ) { $out[] = $l[0] . ': ' . $l[1]; }
		$out[] = null !== $lead['estimate']['start'] ? 'Starting at: $' . number_format( $lead['estimate']['start'] ) : 'Pricing: coming soon';
		foreach ( $lead['estimate']['notes'] as $n ) { $out[] = $n; }
	} else {
		$out[] = $lead['product_name'] . ': priced for your project';
	}
	return $out;
}

function zkst_lead_email_sales( $pub, $lead ) {
	$s   = zkst_settings();
	$to  = '' !== $s['lead_email'] ? $s['lead_email'] : $pub['brand']['email'];
	$c   = $lead['customer'];
	$ch  = $lead['choices'];
	$sub = sprintf( 'New quote lead: %s, %s, %s', $c['name'] ? $c['name'] : $c['email'], $lead['product_name'], $ch['state'] );
	$lines = array_merge(
		array(
			'A customer used "Quote your own project" (' . $pub['brand']['name'] . '). Vet before quoting.',
			'',
			'Name:      ' . $c['name'],
			'Email:     ' . $c['email'] . ' (verified)',
			'Phone:     ' . $c['phone'],
			'Timeline:  ' . $ch['timeline'],
			'Building in: ' . $ch['state'] . ( $ch['zip'] ? ' ' . $ch['zip'] : '' ),
			'',
		),
		zkst_lead_breakdown_text( $lead ),
		array(
			'',
			'UTM: ' . $lead['utm']['utm_source'] . ' / ' . $lead['utm']['utm_medium'] . ' / ' . $lead['utm']['utm_campaign'],
			'First landing page: ' . $lead['utm']['landing_page'],
			'Sent from: ' . $lead['utm']['page'],
		)
	);
	$headers = array( 'Reply-To: ' . ( $c['name'] ? $c['name'] : $c['email'] ) . ' <' . $c['email'] . '>' );
	return (bool) wp_mail( $to, $sub, implode( "\n", $lines ), $headers );
}

function zkst_lead_email_customer( $pub, $lead ) {
	$c     = $lead['customer'];
	$first = $c['name'] ? strtok( $c['name'], ' ' ) : 'there';
	$type  = $lead['choices']['product_type'];
	$lines = array_merge(
		array( 'Hi ' . $first . ',', '', 'Thanks for pricing your project with ' . $pub['brand']['name'] . '. Here is your breakdown:', '' ),
		zkst_lead_breakdown_text( $lead ),
		array( '' ),
		$lead['estimate'] ? zkst_fine_print( $type ) : array(),
		array( '', 'Someone from our team will reach out to talk it through. Questions? ' . $pub['brand']['phone'] . ' or ' . $pub['brand']['email'] . '.' )
	);
	$headers = array( 'Reply-To: ' . $pub['brand']['name'] . ' <' . $pub['brand']['email'] . '>' );
	return (bool) wp_mail( $c['email'], 'Your ' . $lead['product_name'] . ' estimate from ' . $pub['brand']['name'], implode( "\n", $lines ), $headers );
}

/** Save to the customer's own account (customer_quotes), as the customer. */
function zkst_lead_save( $lead ) {
	if ( ! zkst_settings()['save_leads'] ) {
		return false;
	}
	list( $url, $key ) = zkst_customer_target();
	if ( ! $url || ! $key ) {
		return false;
	}
	$e   = $lead['estimate'];
	$row = array(
		'brand'          => $lead['brand'],
		'product_type'   => $lead['choices']['product_type'],
		'product_id'     => $lead['choices']['product_id'],
		'product_name'   => $lead['product_name'],
		'homes'          => $e ? $e['units'] : null,
		'snow'           => $lead['choices']['snow'],
		'assembly'       => $lead['choices']['assembly'],
		'state'          => $lead['choices']['state'],
		'zip'            => $lead['choices']['zip'],
		'timeline'       => $lead['choices']['timeline'],
		'estimate_start' => $e ? $e['start'] : null,
		'estimate'       => $e,
		'utm_source'     => $lead['utm']['utm_source'],
		'utm_medium'     => $lead['utm']['utm_medium'],
		'utm_campaign'   => $lead['utm']['utm_campaign'],
		'landing_page'   => $lead['utm']['landing_page'],
		'page'           => $lead['utm']['page'],
	);
	$res = wp_remote_post(
		untrailingslashit( $url ) . '/rest/v1/customer_quotes',
		array(
			'timeout' => 8,
			'headers' => array( 'apikey' => $key, 'Authorization' => 'Bearer ' . $lead['customer']['token'], 'Content-Type' => 'application/json', 'Prefer' => 'return=minimal' ),
			'body'    => wp_json_encode( $row ),
		)
	);
	return ! is_wp_error( $res ) && wp_remote_retrieve_response_code( $res ) < 300;
}
