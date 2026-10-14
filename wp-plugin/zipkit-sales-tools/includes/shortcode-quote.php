<?php
/**
 * [zipkit_quote]: the full rep quote tool.
 *
 * Logged-out visitors get a sign-in prompt, never the tool. Signed-in users
 * without the zipkit_quote capability get a short note. Pages using the
 * shortcode are kept out of search engines and page caches.
 */

defined( 'ABSPATH' ) || exit;

add_shortcode(
	'zipkit_quote',
	function () {
		if ( ! is_user_logged_in() ) {
			$login = wp_login_url( get_permalink() ? get_permalink() : home_url( add_query_arg( array() ) ) );
			return zkst_quote_notice(
				__( 'Sign in to use the quote tool', 'zipkit-sales-tools' ),
				__( 'The quote tool is for Zip Kit sales reps. Sign in with your Zip Kit account to continue.', 'zipkit-sales-tools' ),
				$login,
				__( 'Sign in', 'zipkit-sales-tools' )
			);
		}
		if ( ! current_user_can( ZKST_CAP ) ) {
			return zkst_quote_notice(
				__( 'This account can\'t use the quote tool yet', 'zipkit-sales-tools' ),
				__( 'Ask Kelsey to give your account the Zip Kit Sales Rep role.', 'zipkit-sales-tools' )
			);
		}

		// Fallback for page builders whose content isn't in post_content.
		zkst_enqueue_quote();

		return '<div class="zk-tool" data-zk-app="quote"><main class="page"><div class="empty">'
			. esc_html__( 'Loading the price list…', 'zipkit-sales-tools' )
			. '</div></main></div>';
	}
);

/** A small boxed message inside the tool's wrapper (styled by tool.css). */
function zkst_quote_notice( $title, $text, $url = '', $button = '' ) {
	wp_enqueue_style( 'zkst-tool' );
	$html  = '<div class="zk-tool zk-notice-page"><main class="page"><div class="card" style="max-width:520px;margin:0 auto">';
	$html .= '<h1 class="step-title">' . esc_html( $title ) . '</h1>';
	$html .= '<p class="step-lead">' . esc_html( $text ) . '</p>';
	if ( $url ) {
		$html .= '<a class="btn primary" href="' . esc_url( $url ) . '">' . esc_html( $button ) . '</a>';
	}
	$html .= '</div></main></div>';
	return $html;
}

/** True when the page being shown uses [zipkit_quote]. */
function zkst_is_quote_page() {
	return zkst_page_has_shortcode( 'zipkit_quote' );
}

// noindex, nofollow: WordPress core robots meta (5.7+).
add_filter(
	'wp_robots',
	function ( $robots ) {
		if ( zkst_is_quote_page() ) {
			$robots['noindex']  = true;
			$robots['nofollow'] = true;
			unset( $robots['max-image-preview'] );
		}
		return $robots;
	}
);

// Yoast SEO prints its own robots meta.
add_filter(
	'wpseo_robots',
	function ( $value ) {
		return zkst_is_quote_page() ? 'noindex, nofollow' : $value;
	}
);

// Rank Math prints its own robots meta as well.
add_filter(
	'rank_math/frontend/robots',
	function ( $robots ) {
		if ( zkst_is_quote_page() ) {
			$robots['index']  = 'noindex';
			$robots['follow'] = 'nofollow';
		}
		return $robots;
	}
);

// Also as a header, and keep the page out of page caches (it differs per user).
add_action(
	'template_redirect',
	function () {
		if ( ! zkst_is_quote_page() ) {
			return;
		}
		if ( ! defined( 'DONOTCACHEPAGE' ) ) {
			define( 'DONOTCACHEPAGE', true );
		}
		nocache_headers();
		header( 'X-Robots-Tag: noindex, nofollow', true );
	}
);

// Leave quote pages out of the WordPress sitemap.
add_filter(
	'wp_sitemaps_posts_query_args',
	function ( $args ) {
		$ids = get_transient( 'zkst_quote_page_ids' );
		if ( false === $ids ) {
			$ids = get_posts(
				array(
					'post_type'      => 'any',
					'post_status'    => 'publish',
					'fields'         => 'ids',
					'posts_per_page' => 50,
					's'              => '[zipkit_quote',
				)
			);
			// The search above also finds similar tags; keep only real [zipkit_quote] pages.
			$ids = array_values(
				array_filter(
					$ids,
					function ( $id ) {
						return has_shortcode( (string) get_post_field( 'post_content', $id ), 'zipkit_quote' );
					}
				)
			);
			set_transient( 'zkst_quote_page_ids', $ids, HOUR_IN_SECONDS );
		}
		if ( $ids ) {
			$args['post__not_in'] = array_merge( isset( $args['post__not_in'] ) ? (array) $args['post__not_in'] : array(), $ids );
		}
		return $args;
	}
);
add_action( 'save_post', function () { delete_transient( 'zkst_quote_page_ids' ); } );
