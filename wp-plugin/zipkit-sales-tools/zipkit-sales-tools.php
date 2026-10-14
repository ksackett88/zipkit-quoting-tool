<?php
/**
 * Plugin Name:       Zip Kit Sales Tools
 * Description:       The Zip Kit quote tool for sales reps, as a shortcode: [zipkit_quote]. Customer quoter: [zipkit_quote_public] (not live until approved). Reps sign in to WordPress, then to the Zip Kit sales account (Supabase), where saved projects and payments live.
 * Version:           0.2.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Zip Kit Homes
 * License:           Proprietary
 * Text Domain:       zipkit-sales-tools
 *
 * The tool itself (JavaScript, CSS, price list, photos) is copied into app/
 * and private/ by wp-plugin/build.ps1 from the zipkit-quoting-tool repo.
 * Don't edit those copies here; change the repo and rebuild.
 */

defined( 'ABSPATH' ) || exit;

define( 'ZKST_VERSION', '0.2.0' );
define( 'ZKST_FILE', __FILE__ );
define( 'ZKST_DIR', plugin_dir_path( __FILE__ ) );
define( 'ZKST_URL', plugin_dir_url( __FILE__ ) );

// Who may use the rep tool. Given to the "Zip Kit Sales Rep" role and to administrators.
define( 'ZKST_CAP', 'zipkit_quote' );

require_once ZKST_DIR . 'includes/settings.php';
require_once ZKST_DIR . 'includes/assets.php';
require_once ZKST_DIR . 'includes/rest.php';
require_once ZKST_DIR . 'includes/shortcode-quote.php';
require_once ZKST_DIR . 'includes/shortcode-public.php';
require_once ZKST_DIR . 'includes/leads.php';

/**
 * On activation: add the "Zip Kit Sales Rep" role (can read + use the quote
 * tool) and give administrators the same capability. Nothing is removed on
 * deactivation, so reps keep their role if the plugin is switched off and on.
 */
function zkst_activate() {
	add_role(
		'zipkit_rep',
		__( 'Zip Kit Sales Rep', 'zipkit-sales-tools' ),
		array(
			'read'   => true,
			ZKST_CAP => true,
		)
	);
	$admin = get_role( 'administrator' );
	if ( $admin && ! $admin->has_cap( ZKST_CAP ) ) {
		$admin->add_cap( ZKST_CAP );
	}
}
register_activation_hook( __FILE__, 'zkst_activate' );
