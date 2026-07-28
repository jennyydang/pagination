(function () {
  // ########################## //
  // ### PRIVATE PROPERTIES ### //
  // ########################## //

  var rootClass = "c-pagination";
  var typePrefix = rootClass.charAt(0);
  var objectName = rootClass.replace(typePrefix + "-", "");
  var components;

  var activeMap = new Map();

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

    // -- the URL is the real source of truth for which page is active (a
    // -- real backend would have already rendered markupPage to match it);
    // -- fall back to what the markup says if there's no ?page= to read
    let totalPages = getTotalPages(component);
    let urlPage = getPageFromUrl();
    let currentPage = markupPage;

    if (!isNaN(urlPage) && urlPage >= 1 && urlPage <= totalPages) {
      currentPage = urlPage;
    }

    setActivePage(component.id, currentPage);
    component.addEventListener("click", handleClick);

    let mobileForm = component.getElementsByClassName(rootClass + "__mobile__form")[0];
    if (mobileForm) {
      mobileForm.addEventListener("submit", handleMobileSubmit);
    }

    updateMobileMax(component);
    updateArrows(component);
    updateMobileInput(component);

    // -- only re-render if the URL disagreed with the markup - leave a
    // -- correctly server-rendered page completely untouched by JS
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
      // let currentPage = getActivePage(component.id);
      let currentPage = getCurrentPage(component);
      goToPage(component, currentPage - 1);
      return;
    }

    // NEXT
    if (trigger.classList.contains(rootClass + "__arrow--next")) {
      if (trigger.disabled) return;
      // let currentPage = getActivePage(component.id);
      let currentPage = getCurrentPage(component);
      goToPage(component, currentPage + 1);
      return;
    }

    // LINKS - real anchors. In the default mode we leave them alone and let
    // the browser follow the href (a genuine navigation). Only
    // data-mode="ajax" makes this component handle them itself instead.
    if (!isAjaxMode(component)) return;

    let href = trigger.getAttribute("href");
    let url = new URL(href, window.location.origin);
    let page = parseInt(url.searchParams.get("page"), 10);

    if (isNaN(page)) return;

    e.preventDefault();

    let totalPages = getTotalPages(component);
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    applyNavigation(component, page, url);
  }

  // -- data-mode="ajax" opts a component into handling its own page/ellipsis
  // -- link clicks via pushState + re-render; anything else (including no
  // -- data-mode at all) leaves those links to their default anchor behavior
  function isAjaxMode(component) {
    return component.dataset.mode === "ajax";
  }

  function handleMobileSubmit(e) {
    let form = e.currentTarget;
    let component = form.closest("." + rootClass);

    let input = form.getElementsByTagName("input")[0];
    let totalPages = getTotalPages(component);

    let value = parseInt(input.value, 10);

    // -- an out-of-range value never navigates anywhere, regardless of mode
    if (isNaN(value) || value < 1 || value > totalPages) {
      e.preventDefault();
      input.value = getActivePage(component.id);
      return;
    }

    // -- default mode: the form is a real method="get" submission to
    // -- ?page=N (same as a page link), so just let it happen
    if (!isAjaxMode(component)) return;

    e.preventDefault();
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

    // -- let the host page know the page changed, so it can sync any of its
    // -- own content (e.g. a results list) alongside the pagination itself
    component.dispatchEvent(
      new CustomEvent("pagination:navigate", {
        bubbles: true,
        detail: { page: page, totalPages: totalPages, url: url.toString() },
      }),
    );
  }

  function goToPage(component, page) {
    let totalPages = getTotalPages(component);

    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    // UPDATE URL
    // ?page=#

    let url = new URL(window.location.href);

    url.searchParams.set("page", page);

    applyNavigation(component, page, url);
  }

  function render(component) {
    let currentPage = getActivePage(component.id);
    let totalPages = getTotalPages(component);
    let pagesContainer = component.getElementsByClassName(rootClass + "__desktop__list")[0];
    let pages = getPages(currentPage, totalPages);

    // -- the two ellipsis <li>s already exist in the markup (hidden by
    // -- default with the "u-hidden" class); they're never created here,
    // -- only shown/hidden and repointed at whatever page they should jump to
    let prevEllipsisLink = pagesContainer.querySelector('[data-ellipsis="prev"]');
    let nextEllipsisLink = pagesContainer.querySelector('[data-ellipsis="next"]');
    let prevEllipsisItem = prevEllipsisLink.closest("li");
    let nextEllipsisItem = nextEllipsisLink.closest("li");

    let showPrevEllipsis = pages.indexOf("prev") !== -1;
    let showNextEllipsis = pages.indexOf("next") !== -1;

    updateEllipsis(prevEllipsisLink, "prev", currentPage, totalPages);
    updateEllipsis(nextEllipsisLink, "next", currentPage, totalPages);

    prevEllipsisItem.classList.toggle("u-hidden", !showPrevEllipsis);
    nextEllipsisItem.classList.toggle("u-hidden", !showNextEllipsis);

    // -- drop last render's page-number links; the two ellipsis <li>s are
    // -- left alone since they don't carry this class
    let oldPageItems = pagesContainer.getElementsByClassName(rootClass + "__desktop__list__item--page");
    while (oldPageItems.length) {
      oldPageItems[0].remove();
    }

    // -- rebuild in order. appendChild() on a node already in the document
    // -- just relocates it, so the "prev"/"next" markers move the existing
    // -- ellipsis <li>s into place instead of creating new ones
    for (let i = 0; i < pages.length; i++) {
      let item = pages[i];

      if (item === "prev") pagesContainer.appendChild(prevEllipsisItem);
      else if (item === "next") pagesContainer.appendChild(nextEllipsisItem);
      else pagesContainer.appendChild(createPage(item, currentPage));
    }

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

  // -- clones a <template> from the page and hands back a detached node
  function cloneTemplate(templateId) {
    let template = document.getElementById(templateId);
    return template.content.firstElementChild.cloneNode(true);
  }

  function createPage(page, currentPage) {
    let current = page === currentPage;

    let li = cloneTemplate(rootClass + "-page-template");
    let link = li.querySelector("a");

    link.href = "?page=" + page;
    link.textContent = page;

    if (current) {
      link.setAttribute("aria-current", "page");
      link.setAttribute("aria-label", "Current page, Page " + page);
    } else {
      link.setAttribute("aria-label", "Go to page " + page);
    }

    return li;
  }

  // -- points an already-existing ellipsis link at whichever page it should
  // -- jump to; never creates anything, just updates the href/aria-label
  function updateEllipsis(link, direction, currentPage, totalPages) {
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

    link.href = "?page=" + targetPage;
    link.setAttribute("aria-label", direction === "prev" ? "Jump backward 5 pages" : "Jump forward 5 pages");
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

  function getTotalPages(component) {
    return parseInt(component.dataset.totalPages, 10);
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

    if (input && window.innerWidth <= 800) {
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
