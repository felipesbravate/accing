// Runs in <head> before the first paint (app/layout.js). Adds .show-splash to <html> when Accing was opened from the
// home screen and the splash has not been shown in this launch yet, or when the URL has ?splash (preview). It also paints
// the page in the splash colour (blue-100) at once, before any stylesheet, so the first frame is never white.
export const SPLASH_SEEN = 'accing-splash-seen';
export const splashScript = `(function(){try{var q=/[?&]splash(=|&|$)/.test(location.search);var s=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;if(q||(s&&!sessionStorage.getItem('${SPLASH_SEEN}'))){var d=document.documentElement;d.classList.add('show-splash');d.style.backgroundColor='#E7E7F7'}}catch(e){}})()`;
