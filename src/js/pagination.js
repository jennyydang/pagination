(function () {
  // ########################## //
  // ### PRIVATE PROPERTIES ### //
  // ########################## //

  var rootClass = "c-pagination";
  var typePrefix = rootClass.charAt(0);
  var objectName = rootClass.replace(typePrefix + "-", "");
  var components;

  var activeMap = new Map();
  const screenMD = 800;
  // -- Verify if manager exists
  /*
        The manager is intended to be as a service to the other modules
        you can (should) register the module to the manager using it's ID
        so that it can be quickly referenced when cross-communication is needed
    */
  var $SUPER = this.Rexus ? this.Rexus : false;
  if (!$SUPER) {
    console.error('Rexus Manager needs to be preloaded for the "' + rootClass + '" to work');
    return;
  }

  // -- Verify if any dependecies are needed
  /*
        Format is very much the same as the condition above
    */

  // ################### //
  // ### CONSTRUCTOR ### //
  // ################### //

  function Pagination() {
    // ######################### //
    // ### PUBLIC PROPERTIES ### //
    // ######################### //

    components = document.getElementsByClassName(rootClass);

    if (components.length) {
      for (let a = 0; a < components.length; a++) {
        components[a].id = "pagination-" + a;

        initialize(components[a]);

        window.addEventListener("popstate", handleBrowser);
      }
    }
  }

  // ###################### //
  // ### PUBLIC METHODS ### //
  // ###################### //

  // ####################### //
  // ### PRIVATE METHODS ### //
  // ####################### //

  function initialize(component) {
    //look for current page
    let currentLink = component.querySelector('[aria-current="page"]');
    //default page
    let markupPage = 1;

    //if there is a current then change text value to number value
    if (currentLink) {
      markupPage = parseInt(currentLink.textContent.trim(), 10);
    }

    //check for current page in URL
    let totalPages = getTotalPages(component);
    let urlPage = getPageFromUrl();
    let currentPage = markupPage;

    // -- trust a valid urlPage on its own; only clamp it against totalPages
    // -- when totalPages is ALSO a real number. Comparing against NaN is
    // -- always false, so requiring "urlPage <= totalPages" up front used to
    // -- silently reject a perfectly valid urlPage whenever totalPages
    // -- couldn't be read (e.g. a missing/invalid data-total-pages) -
    // -- currentPage would fall back to markupPage even though the URL
    // -- unambiguously said otherwise.
    if (!isNaN(urlPage)) {
      currentPage = urlPage;
      if (currentPage < 1) currentPage = 1;
      if (!isNaN(totalPages) && currentPage > totalPages) currentPage = totalPages;
    }

    setActivePage(component.id, currentPage);
    component.addEventListener("click", handleClick);

    let mobileForm = component.getElementsByClassName(rootClass + "__mobile__form")[0];
    if (mobileForm) {
      mobileForm.addEventListener("submit", handleMobileSubmit);

      // -- not every mobile virtual keyboard offers a return/"Go" key for a
      // -- numeric input, and some only offer "Done", which just dismisses
      // -- the keyboard without submitting. Dismissing the keyboard by any
      // -- means (tapping outside, tabbing away, the OS's own "Done") blurs
      // -- the input, so that's what drives navigation on those devices -
      // -- the visible Go button and Enter key still work as before too.
      let mobileInput = mobileForm.getElementsByTagName("input")[0];
      if (mobileInput) {
        mobileInput.addEventListener("blur", handleMobileBlur);
      }
    }

    updateMobileMax(component);
    updateArrows(component);
    updateMobileInput(component);

    // -- only re-render if the URL didnt match up
    if (currentPage !== markupPage) {
      render(component);
    }
  }

  function handleClick(e) {
    let trigger = e.target.closest(
      "." +
        rootClass +
        "__arrow, " +
        "." +
        rootClass +
        "__desktop__list__item__link, " +
        "." +
        rootClass +
        "__desktop__list__item__ellipsis",
    );

    if (!trigger) return;

    let component = trigger.closest("." + rootClass);

    // PREVIOUS
    if (trigger.classList.contains(rootClass + "__arrow--prev")) {
      if (trigger.disabled) return;
      let currentPage = getCurrentPage(component);
      goToPage(component, currentPage - 1);
      return;
    }

    // NEXT
    if (trigger.classList.contains(rootClass + "__arrow--next")) {
      if (trigger.disabled) return;
      let currentPage = getCurrentPage(component);
      goToPage(component, currentPage + 1);
      return;
    }

    // In the default mode we leave them alone and let
    // the browser follow the href (a genuine navigation). Only
    // data-mode="ajax" makes this component handle them itself instead.
    if (!isAjaxMode(component)) return;

    let href = trigger.getAttribute("href");
    // -- only used to read which page this link points at; a page/ellipsis
    // -- link's own href only ever encodes "page" (see buildPageHref), so it
    // -- can't be used as the actual navigation URL without losing whatever
    // -- else (filters, search, sort) is already on the current URL
    let linkUrl = new URL(href, window.location.href);
    let page = parseInt(linkUrl.searchParams.get("page"), 10);

    if (isNaN(page)) return;

    e.preventDefault();

    let totalPages = getTotalPages(component);
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    // -- build the actual navigation URL from the current full URL instead,
    // -- only touching "page", so anything else already there survives
    let url = new URL(window.location.href);
    url.searchParams.set("page", page);

    applyNavigation(component, page, url);
  }

  //default mode: follow default links behavior
  //ajax mode: navigate internally
  function isAjaxMode(component) {
    return component.dataset.mode === "ajax";
  }

  function handleMobileSubmit(e) {
    e.preventDefault();

    let form = e.currentTarget;
    let component = form.closest("." + rootClass);
    let input = form.getElementsByTagName("input")[0];

    submitMobileValue(component, input);
  }

  // -- fires when the mobile "go to page" input is blurred - i.e. the
  // -- keyboard was dismissed by any means, Go key, "Done", or tapping
  // -- elsewhere - not only when the form's own submit event fires (Enter
  // -- or the visible Go button). Shares validation with handleMobileSubmit
  // -- so both paths behave identically, and no-ops if the value already
  // -- matches the active page so a Go-button tap right after a blur
  // -- doesn't push a second, redundant history entry.
  function handleMobileBlur(e) {
    let input = e.currentTarget;
    let component = input.closest("." + rootClass);

    submitMobileValue(component, input);
  }

  function submitMobileValue(component, input) {
    let totalPages = getTotalPages(component);
    let value = parseInt(input.value, 10);

    if (isNaN(value) || value < 1 || value > totalPages) {
      input.value = getActivePage(component.id);
      return;
    }

    if (value === getActivePage(component.id)) return;

    goToPage(component, value);
  }

  // -- applies a page change to the DOM/URL and notifies the host page.
  // -- Used directly by the arrows and mobile form (which have no href of
  // -- their own to fall back on, so they always self-handle regardless of
  // -- data-mode), and by handleClick's LINKS branch when data-mode="ajax".
  function applyNavigation(component, page, url) {
    let totalPages = getTotalPages(component);

    setActivePage(component.id, page);
    window.history.pushState({}, "", url);
    render(component);
  }

  function goToPage(component, page) {
    let totalPages = getTotalPages(component);

    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    // UPDATE URL
    // ?page=#
    let url = new URL(window.location.href);

    url.searchParams.set("page", page);

    if (!isAjaxMode(component)) {
      window.location.assign(url);
      return;
    }

    applyNavigation(component, page, url);
  }

  function render(component) {
    let currentPage = getActivePage(component.id);
    let totalPages = getTotalPages(component);
    let pagesContainer = component.getElementsByClassName(rootClass + "__desktop__list")[0];
    let pages = getPages(currentPage, totalPages);

    let html = "";

    for (let i = 0; i < pages.length; i++) {
      let item = pages[i];

      if (item === "prev") {
        html += createEllipsis(currentPage, totalPages, "prev", pagesContainer.dataset.prevlabel);
      } else if (item === "next") {
        html += createEllipsis(currentPage, totalPages, "next", pagesContainer.dataset.next);
      } else {
        html += createPage(item, currentPage, pagesContainer.dataset.currentlabel, pagesContainer.dataset.golabel);
      }
    }

    pagesContainer.innerHTML = html;

    updateMobileMax(component);
    updateArrows(component);
    updateMobileInput(component);
  }

  function getPages(currentPage, totalPages) {
    let pages = [];

    // SHOW ALL
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
      return pages;
    }

    // ALWAYS SHOW FIRST
    pages.push(1);

    // PAGE 1–3
    // < 1 2 3 4 5 ... 50 >
    if (currentPage <= 3) {
      pages.push(2, 3, 4, 5);
      pages.push("next");
    }

    // PAGE 4
    // < 1 2 3 4 5 6 ... 50 >
    else if (currentPage === 4) {
      pages.push(2, 3, 4, 5, 6);
      pages.push("next");
    }

    // MIDDLE
    // < 1 ... 3 4 5 6 7 ... 50 >
    else if (currentPage >= 5 && currentPage <= totalPages - 4) {
      pages.push("prev");
      pages.push(currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2);
      pages.push("next");
    }

    // END RANGE
    // < 1 ... 45 46 47 48 49 50 >
    else {
      pages.push("prev");
      pages.push(totalPages - 5, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1);
    }

    // ALWAYS SHOW LAST
    pages.push(totalPages);

    // REMOVE DUPLICATES
    pages = pages.filter(function (value, index, self) {
      return self.indexOf(value) === index;
    });

    return pages;
  }

  // -- builds an href for a given page from the CURRENT full URL, only
  // -- touching "page" - so every link/ellipsis this component renders
  // -- keeps whatever else is already on the URL (filters, search, sort),
  // -- and a plain click in the default (non-ajax) mode, which just lets
  // -- the browser follow the href as-is, doesn't lose any of it
  function buildPageHref(page) {
    let url = new URL(window.location.href);
    url.searchParams.set("page", page);
    return url.search;
  }

  function createPage(page, currentPage, currentLabel, goLabel) {
    let current = page === currentPage;

    return `
      <li class="c-pagination__desktop__list__item">
        <a
          class="c-pagination__desktop__list__item__link"
          href="${buildPageHref(page)}"
          ${current ? 'aria-current="page"' : ""}
          aria-label="${current ? `${currentLabel}${page}` : `${goLabel}${page}`}"
        >
          ${page}
        </a>
      </li>
    `;
  }

  function createEllipsis(currentPage, totalPages, direction, label) {
    let targetPage;

    if (direction === "prev") {
      targetPage = currentPage - 5;
      if (targetPage < 1) targetPage = 1;
    } else {
      targetPage = currentPage + 5;

      if (targetPage > totalPages) {
        targetPage = totalPages;
      }
    }

    return `
      <li class="c-pagination__desktop__list__item">
        <a
          class="c-pagination__desktop__list__item__ellipsis"
          href="${buildPageHref(targetPage)}"
          data-ellipsis="${direction}"
          aria-label="${label}"
        >
          <span>&hellip;</span>

          <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
            ${direction === "next" ? 'style="transform: rotate(180deg);"' : ""}>
            <path
              d="m16.96 16.948 6.198 6.126c.52.513 1.355.513 1.874 0l.016-.015a1.323 1.323 0 0 0 0-1.883L19.81 16l5.238-5.176a1.323 1.323 0 0 0 0-1.883l-.016-.015a1.333 1.333 0 0 0-1.874 0l-6.199 6.126a1.333 1.333 0 0 0 0 1.896Zm-10 0 6.198 6.126c.52.513 1.355.513 1.874 0l.016-.015a1.323 1.323 0 0 0 0-1.883L9.81 16l5.238-5.176a1.323 1.323 0 0 0 0-1.883l-.016-.015a1.333 1.333 0 0 0-1.874 0L6.96 15.052a1.333 1.333 0 0 0 0 1.896Z"
              fill-rule="evenodd"
            ></path>
          </svg>
        </a>
      </li>
    `;
  }

  function updateArrows(component) {
    let currentPage = getActivePage(component.id);
    let totalPages = getTotalPages(component);

    let prevBtns = component.getElementsByClassName(rootClass + "__arrow--prev")[0];
    let nextBtns = component.getElementsByClassName(rootClass + "__arrow--next")[0];
    prevBtns.disabled = currentPage === 1;
    nextBtns.disabled = currentPage === totalPages;
  }

  function updateMobileInput(component) {
    let input = component.getElementsByTagName("input")[0];

    if (input) {
      input.value = getActivePage(component.id);
      input.max = getTotalPages(component);
    }
  }

  function updateMobileMax(component) {
    let max = component.getElementsByClassName(rootClass + "__mobile__form__total")[0];
    if (max) max.textContent = getTotalPages(component);
  }

  // -- never returns NaN: every other function trusts this value in
  // -- comparisons (getPages(), the initialize()/handleBrowser() URL sync,
  // -- the arrow/mobile-input clamping), and a NaN here would silently
  // -- corrupt all of them (e.g. "n <= NaN" is always false), so a missing
  // -- or invalid data-total-pages degrades to 1 instead, with a clear
  // -- console error pointing at the actual misconfiguration
  function getTotalPages(component) {
    let totalPages = parseInt(component.dataset.totalPages, 10);

    if (isNaN(totalPages) || totalPages < 1) {
      console.error(
        rootClass + ": missing or invalid data-total-pages on this component - defaulting to 1",
        component,
      );
      return 1;
    }

    return totalPages;
  }

  function setActivePage(id, page) {
    activeMap.set(id, page);
  }

  function getActivePage(id) {
    if (activeMap.has(id)) {
      return activeMap.get(id);
    }
    return 1;
  }

  function getPageFromUrl() {
    return parseInt(new URL(window.location.href).searchParams.get("page"), 10);
  }

  function getCurrentPage(component) {
    let input = component.getElementsByTagName("input")[0];

    // MOBILE INPUT EXISTS
    // USE INPUT VALUE

    if (input && window.innerWidth <= screenMD) {
      let value = parseInt(input.value, 10);

      if (!isNaN(value)) {
        return value;
      }
    }

    // FALLBACK TO ACTIVE MAP
    return getActivePage(component.id);
  }

  function handleBrowser() {
    let page = getPageFromUrl();

    if (isNaN(page)) page = 1;

    for (let i = 0; i < components.length; i++) {
      let component = components[i];
      setActivePage(component.id, page);
      render(component);
    }
  }

  // -- initiate into Rexus object
  $SUPER[objectName] = new Pagination();
})();
