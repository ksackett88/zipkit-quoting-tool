<?php
/**
 * REST endpoint for the full price list.
 *
 * GET /wp-json/zipkit/v1/catalog  (reps only)
 *
 * The full catalog has internal rates, so it is not a public file. The build
 * script stores it as private/catalog.json.php, which starts with a PHP exit:
 * a direct web request runs that line and gets an empty page, on Apache and
 * nginx alike. Only this endpoint reads it, and only for signed-in reps.
 */

defined( 'ABSPATH' ) || exit;

/** The catalog JSON text, or null if it's missing. */
function zkst_catalog_json() {
	$file = ZKST_DIR . 'private/catalog.json.php';
	if ( ! is_readable( $file ) ) {
		return null;
	}
	$raw = file_get_contents( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
	// Drop the guard line: everything up to the end of the first PHP block.
	$pos = strpos( $raw, '?>' );
	return false === $pos ? null : ltrim( substr( $raw, $pos + 2 ) );
}

/** Product count and date for the settings page, or null. */
function zkst_catalog_info() {
	$json = zkst_catalog_json();
	$data = $json ? json_decode( $json, true ) : null;
	if ( ! is_array( $data ) || empty( $data['products'] ) ) {
		return null;
	}
	return array(
		'products' => count( $data['products'] ),
		'updated'  => isset( $data['updated'] ) ? $data['updated'] : '?',
	);
}

add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'zipkit/v1',
			'/catalog',
			array(
				'methods'             => 'GET',
				'permission_callback' => function () {
					return current_user_can( ZKST_CAP );
				},
				'callback'            => function () {
					$json = zkst_catalog_json();
					if ( null === $json ) {
						return new WP_Error( 'zkst_no_catalog', 'The price list is missing. Rebuild the plugin.', array( 'status' => 500 ) );
					}
					// Objects, not arrays: keeps empty {} as {} so the tool reads it unchanged.
					$data = json_decode( $json );
					if ( ! is_object( $data ) ) {
						return new WP_Error( 'zkst_bad_catalog', 'The price list could not be read.', array( 'status' => 500 ) );
					}
					$res = new WP_REST_Response( $data );
					$res->header( 'Cache-Control', 'no-store, private' );
					$res->header( 'X-Robots-Tag', 'noindex' );
					return $res;
				},
			)
		);
	}
);
