export function googleTagBootstrap(measurementId: string) {
  return `window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};window.gtag('set','developer_id.dZjgwMW',true);window.gtag('js',new Date());window.gtag('config',${JSON.stringify(measurementId)},{send_page_view:false});`;
}

export function trackGooglePageView(measurementId: string, pathname: string) {
  const analyticsWindow = window as Window & { gtag?: (...args: unknown[]) => void };
  analyticsWindow.gtag?.("event", "page_view", {
    send_to: measurementId,
    page_path: pathname,
    // Exclude query strings and fragments, which can contain account tokens or personal data.
    page_location: `${window.location.origin}${pathname}`,
    page_title: document.title,
  });
}