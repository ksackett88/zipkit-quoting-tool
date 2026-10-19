<?php
/**
 * [zipkit_quote_public]: "Quote your own project" for customers.
 *
 * Loads only the public catalog (app/data/catalog-public-<brand>.json) and posts
 * leads to the plugin's own endpoint (includes/leads.php). No payments.
 */

defined( 'ABSPATH' ) || exit;

add_action(
	'wp_enqueue_scripts',
	function () {
		wp_register_style( 'zkst-public', zkst_app_url( 'css/public.css' ), array( 'zkst-tool' ), null );
		wp_register_script( 'zkst-public', zkst_app_url( 'js/public.js' ), array( 'zkst-supabase-js', 'zkst-config' ), null, true );
		if ( zkst_page_has_shortcode( 'zipkit_quote_public' ) ) {
			zkst_enqueue_public();
		}
	},
	101
);

function zkst_enqueue_public() {
	static $done = false;
	if ( $done ) {
		return;
	}
	$done = true;
	$config = array(
		'base'             => ZKST_URL . 'app/',
		'brand'            => zkst_public_brand(),
		'publicCatalogUrl' => zkst_app_url( 'data/catalog-public-' . zkst_public_brand() . '.json' ),
		'estimateUrl'      => rest_url( 'zipkit/v1/estimate' ),
		'leadUrl'          => rest_url( 'zipkit/v1/lead' ),
		'accounts'         => zkst_test_signin() ? 'stub' : 'supabase',
		'testSignin'       => zkst_test_signin(),
		'customerSupabaseUrl' => zkst_customer_target()[0],
		'customerSupabaseKey' => zkst_customer_target()[1],
		'publicMount'      => '[data-zk-app="public"]',
		'legacyGlobals'    => false,
	);
	// The rep tool may share the page; only add the config once.
	if ( ! wp_script_is( 'zkst-flow', 'enqueued' ) ) {
		wp_add_inline_script( 'zkst-config', 'window.ZK_CONFIG = ' . wp_json_encode( $config ) . ';', 'before' );
	}
	wp_enqueue_style( 'zkst-public' );
	wp_enqueue_script( 'zkst-public' );
}

add_shortcode(
	'zipkit_quote_public',
	function () {
		zkst_enqueue_public();
		return '<div class="zk-tool zk-public" data-zk-app="public"><noscript><p>'
			. esc_html__( 'Please turn on JavaScript to price your project, or give us a call.', 'zipkit-sales-tools' )
			. '</p></noscript></div>';
	}
);
