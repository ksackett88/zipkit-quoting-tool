<?php
/**
 * Scripts and styles. Registered everywhere, but enqueued only on pages that
 * use a Zip Kit shortcode (checked before the page renders, with a fallback
 * inside the shortcode for page builders that keep content elsewhere).
 */

defined( 'ABSPATH' ) || exit;

/** URL of a file in app/, versioned by its modified time so updates bust caches. */
function zkst_app_url( $rel ) {
	$path = ZKST_DIR . 'app/' . $rel;
	$ver  = is_readable( $path ) ? (string) filemtime( $path ) : ZKST_VERSION;
	return add_query_arg( 'ver', $ver, ZKST_URL . 'app/' . $rel );
}

add_action(
	'wp_enqueue_scripts',
	function () {
		// The Supabase client (sign-in, saved projects). Same build the GitHub Pages tool uses.
		wp_register_script( 'zkst-supabase-js', 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0', array(), null, true );

		// Versions go in the URL (zkst_app_url), so WordPress adds none.
		$js = array(
			'zkst-config'   => array( 'js/config.js', array() ),
			'zkst-supabase' => array( 'lib/supabase.js', array( 'zkst-supabase-js', 'zkst-config' ) ),
			'zkst-pricing'  => array( 'js/pricing.js', array( 'zkst-config' ) ),
			'zkst-catalog'  => array( 'js/catalog.js', array( 'zkst-config' ) ),
			'zkst-options'  => array( 'js/options.js', array( 'zkst-pricing' ) ),
			'zkst-docs'     => array( 'js/documents.js', array( 'zkst-pricing' ) ),
			'zkst-store'    => array( 'js/store.js', array( 'zkst-supabase' ) ),
			'zkst-legacy'   => array( 'js/legacy-adapter.js', array( 'zkst-config' ) ),
			'zkst-schedule' => array( 'js/schedule.js', array( 'zkst-config' ) ),
			'zkst-flow'     => array( 'js/flow.js', array( 'zkst-supabase', 'zkst-pricing', 'zkst-catalog', 'zkst-options', 'zkst-docs', 'zkst-store', 'zkst-legacy', 'zkst-schedule' ) ),
		);
		foreach ( $js as $handle => $j ) {
			wp_register_script( $handle, zkst_app_url( $j[0] ), $j[1], null, true );
		}
		wp_register_style( 'zkst-tool', zkst_app_url( 'css/tool.css' ), array(), null );

		if ( zkst_page_has_shortcode( 'zipkit_quote' ) ) {
			// Only people who can use the tool get its scripts; everyone else
			// sees the sign-in or "ask Kelsey" box, which needs just the styles.
			if ( current_user_can( ZKST_CAP ) ) {
				zkst_enqueue_quote();
			} else {
				wp_enqueue_style( 'zkst-tool' );
			}
		}
	},
	// Late, so the tool's stylesheet prints after the theme's.
	100
);

/** True when the current singular page's content uses the shortcode. */
function zkst_page_has_shortcode( $tag ) {
	if ( ! is_singular() ) {
		return false;
	}
	$post = get_post();
	return $post && has_shortcode( $post->post_content, $tag );
}

/** Load the rep tool and hand it its settings (window.ZK_CONFIG). */
function zkst_enqueue_quote() {
	static $done = false;
	if ( $done ) {
		return;
	}
	$done = true;

	$s      = zkst_settings();
	$config = array(
		'base'           => ZKST_URL . 'app/',
		'docPhotos'      => 'web', // the plugin ships photos/web/ copies, not the originals
		'catalogUrl'     => rest_url( 'zipkit/v1/catalog' ),
		'catalogHeaders' => array( 'X-WP-Nonce' => wp_create_nonce( 'wp_rest' ) ),
		'portalUrl'      => zkst_link( 'portal_url' ),
		'contractUrl'    => zkst_link( 'contract_url' ),
		'legacyMvpUrl'   => zkst_link( 'mvp_url' ),
		'supabaseUrl'    => $s['supabase_url'],
		'supabaseKey'    => $s['supabase_key'],
		'requireAuth'    => true,
		'legacyGlobals'  => false,
		'mount'          => '[data-zk-app="quote"]',
	);
	wp_add_inline_script( 'zkst-config', 'window.ZK_CONFIG = ' . wp_json_encode( $config ) . ';', 'before' );
	wp_enqueue_style( 'zkst-tool' );
	wp_enqueue_script( 'zkst-flow' );
}
