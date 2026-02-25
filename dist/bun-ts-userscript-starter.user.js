// ==UserScript==
// @name         bun-ts-userscript-starter
// @namespace    https://github.com/genzj/bun-ts-userscript-starter
// @version      1.0.2
// @description  A Greasemonkey/Tampermonkey/Violentmonkey Bun + TypeScript boilerplate
// @license      MIT
// @author       genzj
// @updateURL    https://github.com/genzj/bun-ts-userscript-starter/raw/main/dist/bun-ts-userscript-starter.user.js
// @downloadURL  https://github.com/genzj/bun-ts-userscript-starter/raw/main/dist/bun-ts-userscript-starter.user.js
// @match        http*://example.com/
// @match        http*://www.example.com/
// @grant        GM_addStyle
// ==/UserScript==

var e="<div class=\"injected-html\">\n    This is some injected html in the page.\n</div>\n";var t=".injected-html{color:#fffc;background:linear-gradient(90deg,#020024 0%,#090979 35%,#00d4ff 100%);font-family:Arial,Helvetica,sans-serif}";class i{constructor(){this.injectHTML(e),console.log("If you see this message, it means that the script has been injected :)")}injectHTML(n){GM_addStyle(t),document.querySelector("body")?.insertAdjacentHTML("afterbegin",n)}}var d=new i;
