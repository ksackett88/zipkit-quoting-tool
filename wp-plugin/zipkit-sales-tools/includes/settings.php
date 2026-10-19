<?php
/**
 * WP Admin → Zip Kit Tools: settings for the quote tool.
 *
 * Every field is optional. Blank means "use the built-in default": the
 * Supabase defaults live in app/lib/supabase.js, the links default to the
 * GitHub Pages copies of the portal and contract generator.
 * Values are stored in the database (option "zkst_settings"), never in PHP.
 */

defined( 'ABSPATH' ) || exit;

const ZKST_OPTION = 'zkst_settings';

// Where the portal and contract generator live until they move to WordPress.
const ZKST_DEFAULT_SITE = 'https://ksackett88.github.io/zipkit-quoting-tool/';

/** Settings with defaults filled in. */
function zkst_settings() {
	$saved = get_option( ZKST_OPTION, array() );
	$saved = is_array( $saved ) ? $saved : array();
	return wp_parse_args(
		$saved,
		array(
			'supabase_url' => '',
			'supabase_key' => '',
			'portal_url'   => '',
			'contract_url' => '',
			'mvp_url'      => '',
			'lead_email'   => '',
			'public_brand' => 'mvp',
			'customer_supabase_url' => '',
			'customer_supabase_key' => '',
			'save_leads'   => false,
			'test_signin'  => false,
		)
	);
}

/** A link setting, or its default. */
function zkst_link( $key ) {
	$defaults = array(
		'portal_url'   => ZKST_DEFAULT_SITE . 'index.html',
		'contract_url' => ZKST_DEFAULT_SITE . 'ZipKit_Contract_Generator.html',
		'mvp_url'      => ZKST_DEFAULT_SITE . 'legacy/mvp-quote.html',
	);
	$s = zkst_settings();
	return '' !== $s[ $key ] ? $s[ $key ] : $defaults[ $key ];
}

/**
 * True for keys that must never be in a browser: Supabase secret keys
 * ("sb_secret_…") and legacy service_role JWTs.
 */
function zkst_is_secret_key( $key ) {
	if ( 0 === strpos( $key, 'sb_secret_' ) ) {
		return true;
	}
	$parts = explode( '.', $key );
	if ( 3 === count( $parts ) ) {
		$payload = json_decode( base64_decode( strtr( $parts[1], '-_', '+/' ) ), true );
		if ( is_array( $payload ) && isset( $payload['role'] ) && 'service_role' === $payload['role'] ) {
			return true;
		}
	}
	return false;
}

function zkst_sanitize_settings( $in ) {
	$in  = is_array( $in ) ? $in : array();
	$out = zkst_settings();

	$out['supabase_url'] = isset( $in['supabase_url'] ) ? esc_url_raw( trim( $in['supabase_url'] ), array( 'https' ) ) : '';

	$key = isset( $in['supabase_key'] ) ? sanitize_text_field( trim( $in['supabase_key'] ) ) : '';
	if ( '' !== $key && zkst_is_secret_key( $key ) ) {
		add_settings_error( ZKST_OPTION, 'zkst_secret', __( 'That is a Supabase secret (service role) key. It would be visible to anyone using the tool, so it was not saved. Use the publishable (anon) key.', 'zipkit-sales-tools' ) );
		$key = $out['supabase_key'];
	}
	$out['supabase_key'] = $key;

	foreach ( array( 'portal_url', 'contract_url', 'mvp_url' ) as $k ) {
		$out[ $k ] = isset( $in[ $k ] ) ? esc_url_raw( trim( $in[ $k ] ), array( 'https', 'http' ) ) : '';
	}

	$email             = isset( $in['lead_email'] ) ? sanitize_email( $in['lead_email'] ) : '';
	$out['lead_email'] = is_email( $email ) ? $email : '';
	$out['public_brand'] = ( isset( $in['public_brand'] ) && in_array( $in['public_brand'], array( 'mvp', 'zipkit' ), true ) ) ? $in['public_brand'] : 'mvp';
	$out['customer_supabase_url'] = isset( $in['customer_supabase_url'] ) ? esc_url_raw( trim( $in['customer_supabase_url'] ), array( 'https' ) ) : '';
	$ckey = isset( $in['customer_supabase_key'] ) ? sanitize_text_field( trim( $in['customer_supabase_key'] ) ) : '';
	if ( '' !== $ckey && zkst_is_secret_key( $ckey ) ) {
		add_settings_error( ZKST_OPTION, 'zkst_secret_c', __( 'That customer key is a Supabase secret (service role) key. It was not saved. Use the publishable (anon) key.', 'zipkit-sales-tools' ) );
		$ckey = zkst_settings()['customer_supabase_key'];
	}
	$out['customer_supabase_key'] = $ckey;
	$out['save_leads'] = ! empty( $in['save_leads'] );
	$out['test_signin'] = ! empty( $in['test_signin'] );
	return $out;
}

add_action(
	'admin_init',
	function () {
		register_setting(
			'zkst',
			ZKST_OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => 'zkst_sanitize_settings',
				'default'           => array(),
			)
		);

		add_settings_section( 'zkst_supabase', __( 'Sales account (Supabase)', 'zipkit-sales-tools' ), function () {
			echo '<p>' . esc_html__( 'Saved projects, invoices and payments live in Supabase. Leave these blank to use the built-in project. Only ever paste the publishable (anon) key here, never a secret or service role key.', 'zipkit-sales-tools' ) . '</p>';
		}, 'zkst' );
		add_settings_section( 'zkst_leads', __( 'Customer quoter ([zipkit_quote_public])', 'zipkit-sales-tools' ), function () {
			echo '<p>' . esc_html__( 'Customers make their own account (email link, so every email is verified) in a separate Supabase project for customers, never the sales one. Run sql/customer-project/2026-10_customer_accounts.sql there first.', 'zipkit-sales-tools' ) . '</p>';
		}, 'zkst' );
		add_settings_field( 'public_brand', __( 'Runs as brand', 'zipkit-sales-tools' ), function () {
			$v = zkst_settings()['public_brand'];
			echo '<select name="' . esc_attr( ZKST_OPTION ) . '[public_brand]" id="zkst-public_brand">';
			foreach ( array( 'mvp' => 'Mountain Valley Prefab (pilot)', 'zipkit' => 'Zip Kit Homes' ) as $k => $label ) {
				echo '<option value="' . esc_attr( $k ) . '"' . selected( $v, $k, false ) . '>' . esc_html( $label ) . '</option>';
			}
			echo '</select>';
		}, 'zkst', 'zkst_leads', array( 'label_for' => 'zkst-public_brand' ) );
		foreach ( array( 'customer_supabase_url' => array( __( 'Customer Supabase URL', 'zipkit-sales-tools' ), 'https://xxxx.supabase.co' ), 'customer_supabase_key' => array( __( 'Customer publishable key', 'zipkit-sales-tools' ), 'sb_publishable_…' ) ) as $k => $f ) {
			add_settings_field( $k, $f[0], function () use ( $k, $f ) {
				printf( '<input type="text" class="regular-text code" name="%1$s[%2$s]" id="zkst-%2$s" value="%3$s" placeholder="%4$s" autocomplete="off" spellcheck="false">', esc_attr( ZKST_OPTION ), esc_attr( $k ), esc_attr( zkst_settings()[ $k ] ), esc_attr( $f[1] ) );
				if ( '' === zkst_settings()[ $k ] ) {
					echo '<p class="description">' . esc_html__( 'Blank: customer accounts are off, and the quoter says it is not open yet.', 'zipkit-sales-tools' ) . '</p>';
				}
			}, 'zkst', 'zkst_leads', array( 'label_for' => 'zkst-' . $k ) );
		}
		add_settings_field( 'lead_email', __( 'Send leads to', 'zipkit-sales-tools' ), function () {
			printf( '<input type="email" class="regular-text" name="%1$s[lead_email]" id="zkst-lead_email" value="%2$s" placeholder="%3$s">', esc_attr( ZKST_OPTION ), esc_attr( zkst_settings()['lead_email'] ), esc_attr__( 'Blank: the brand\'s sales email', 'zipkit-sales-tools' ) );
		}, 'zkst', 'zkst_leads', array( 'label_for' => 'zkst-lead_email' ) );
		add_settings_field( 'save_leads', __( 'Save quotes to Supabase', 'zipkit-sales-tools' ), function () {
			printf( '<label><input type="checkbox" name="%1$s[save_leads]" value="1" %2$s> %3$s</label>', esc_attr( ZKST_OPTION ), checked( zkst_settings()['save_leads'], true, false ), esc_html__( 'Also save each sent quote to the customer\'s account (customer_quotes)', 'zipkit-sales-tools' ) );
		}, 'zkst', 'zkst_leads' );
		add_settings_field( 'test_signin', __( 'Test sign-in', 'zipkit-sales-tools' ), function () {
			printf( '<label><input type="checkbox" name="%1$s[test_signin]" value="1" %2$s> %3$s</label>', esc_attr( ZKST_OPTION ), checked( zkst_settings()['test_signin'], true, false ), esc_html__( 'Skip the email link (test the customer flow without the customer Supabase project)', 'zipkit-sales-tools' ) );
			echo '<p class="description">' . ( zkst_is_local_site()
				? esc_html__( 'This is a local site, so this works here. Turn it off when you are done.', 'zipkit-sales-tools' )
				: esc_html__( 'This is not a local site, so this setting does nothing here.', 'zipkit-sales-tools' ) ) . '</p>';
		}, 'zkst', 'zkst_leads' );
		add_settings_section( 'zkst_links', __( 'Links', 'zipkit-sales-tools' ), function () {
			echo '<p>' . esc_html__( 'Where the tool sends reps for the portal, contracts and old MVP quotes. Blank uses the current GitHub Pages copies.', 'zipkit-sales-tools' ) . '</p>';
		}, 'zkst' );

		$fields = array(
			'supabase_url' => array( 'zkst_supabase', __( 'Supabase URL', 'zipkit-sales-tools' ), 'https://xxxx.supabase.co' ),
			'supabase_key' => array( 'zkst_supabase', __( 'Supabase publishable key', 'zipkit-sales-tools' ), 'sb_publishable_…' ),
			'portal_url'   => array( 'zkst_links', __( 'Sales portal', 'zipkit-sales-tools' ), zkst_link( 'portal_url' ) ),
			'contract_url' => array( 'zkst_links', __( 'Contract generator', 'zipkit-sales-tools' ), zkst_link( 'contract_url' ) ),
			'mvp_url'      => array( 'zkst_links', __( 'Old MVP quote tool', 'zipkit-sales-tools' ), zkst_link( 'mvp_url' ) ),
		);
		foreach ( $fields as $key => $f ) {
			add_settings_field(
				$key,
				$f[1],
				function () use ( $key, $f ) {
					$s = zkst_settings();
					printf(
						'<input type="text" class="regular-text code" name="%1$s[%2$s]" id="zkst-%2$s" value="%3$s" placeholder="%4$s" autocomplete="off" spellcheck="false">',
						esc_attr( ZKST_OPTION ),
						esc_attr( $key ),
						esc_attr( zkst_settings()[ $key ] ),
						esc_attr( $f[2] )
					);
					if ( '' === $s[ $key ] ) {
						echo '<p class="description">' . esc_html__( 'Blank: using the built-in default.', 'zipkit-sales-tools' ) . '</p>';
					}
				},
				'zkst',
				$f[0],
				array( 'label_for' => 'zkst-' . $key )
			);
		}
	}
);

add_action(
	'admin_menu',
	function () {
		add_menu_page(
			__( 'Zip Kit Tools', 'zipkit-sales-tools' ),
			__( 'Zip Kit Tools', 'zipkit-sales-tools' ),
			'manage_options',
			'zkst',
			'zkst_render_settings_page',
			'dashicons-calculator',
			58
		);
	}
);

function zkst_render_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$catalog = zkst_catalog_info();
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Zip Kit Tools', 'zipkit-sales-tools' ); ?></h1>
		<?php settings_errors( ZKST_OPTION ); ?>

		<div class="card" style="max-width:760px">
			<h2><?php esc_html_e( 'How to use it', 'zipkit-sales-tools' ); ?></h2>
			<p><?php echo wp_kses_post( __( 'Put <code>[zipkit_quote]</code> on a page. Reps must be signed in to WordPress with the <b>Zip Kit Sales Rep</b> role (administrators can use it too). The page is hidden from search engines automatically.', 'zipkit-sales-tools' ) ); ?></p>
			<p>
				<?php esc_html_e( 'Price list:', 'zipkit-sales-tools' ); ?>
				<?php if ( $catalog ) : ?>
					<b><?php echo esc_html( $catalog['products'] ); ?></b> <?php esc_html_e( 'products, last updated', 'zipkit-sales-tools' ); ?> <b><?php echo esc_html( $catalog['updated'] ); ?></b>.
				<?php else : ?>
					<b style="color:#b32d2e"><?php esc_html_e( 'missing. Rebuild the plugin with wp-plugin/build.ps1.', 'zipkit-sales-tools' ); ?></b>
				<?php endif; ?>
				<?php esc_html_e( 'Prices change in the repo (data/catalog.json), then a rebuilt plugin is installed. See README.md.', 'zipkit-sales-tools' ); ?>
			</p>
		</div>

		<form method="post" action="options.php">
			<?php
			settings_fields( 'zkst' );
			do_settings_sections( 'zkst' );
			submit_button();
			?>
		</form>
	</div>
	<?php
}
