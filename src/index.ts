import APP_HTML from "./html/main-content.html";
import STYLES from "./scss/style.scss";

class App {
  constructor() {
    this.injectHTML(APP_HTML);
    console.log(
      "If you see this message, it means that the script has been injected :)"
    );
  }
  private injectHTML(htmlContent: string) {
    GM_addStyle(STYLES);
    document.querySelector("body")?.insertAdjacentHTML("afterbegin", htmlContent);
  }
}

const yourAppInstance = new App();
