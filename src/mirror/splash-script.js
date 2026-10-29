// Runs in <head> before the first paint (app/layout.js). Adds .show-splash to <html> when Accing was opened from the
// home screen and the splash has not been shown in this launch yet, or when the URL has ?splash (preview).
export const SPLASH_SEEN = 'accing-splash-seen';
export const splashScript = `(function(){try{var q=/[?&]splash(=|&|$)/.test(location.search);var s=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;if(q||(s&&!sessionStorage.getItem('${SPLASH_SEEN}')))document.documentElement.classList.add('show-splash')}catch(e){}})()`;
