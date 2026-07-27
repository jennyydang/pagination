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
    let currentPage = 1;

    //if there is a current then change text value to number value
    if (currentLink) {
      currentPage = parseInt(currentLink.textContent.trim(), 10);
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

    // LINKS
    e.preventDefault();

    let href = trigger.getAttribute("href");
    let url = new URL(href, window.location.origin);
    let page = parseInt(url.searchParams.get("page"), 10);

    if (!isNaN(page)) {
      goToPage(component, page);
    }
  }

  function handleMobileSubmit(e) {
    e.preventDefault();

    let form = e.currentTarget;
    let component = form.closest("." + rootClass);

    let input = form.getElementsByTagName("input")[0];
    let totalPages = getTotalPages(component);

    let value = parseInt(input.value, 10);

    if (!isNaN(value) && value >= 1 && value <= totalPages) {
      goToPage(component, value);
    } else {
      input.value = getActivePage(component.id);
    }
  }

  function goToPage(component, page) {
    let totalPages = getTotalPages(component);

    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    setActivePage(component.id, page);

    // UPDATE URL
    // ?page=#

    let url = new URL(window.location.href);

    url.searchParams.set("page", page);

    window.history.pushState({}, "", url);

    render(component);

    // -- let the host page know the page changed, so it can fetch new
    // -- content itself instead of a full reload (AJAX-style navigation)
    component.dispatchEvent(
      new CustomEvent("pagination:navigate", {
        bubbles: true,
        detail: { page: page, totalPages: totalPages, url: url.toString() },
      }),
    );
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
        html += createEllipsis(currentPage, totalPages, "prev");
      } else if (item === "next") {
        html += createEllipsis(currentPage, totalPages, "next");
      } else {
        html += createPage(item, currentPage);
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

  function createPage(page, currentPage) {
    let current = page === currentPage;

    return `
      <li class="c-pagination__desktop__list__item">
        <a
          class="c-pagination__desktop__list__item__link"
          href="?page=${page}"
          ${current ? 'aria-current="page"' : ""}
          aria-label="${current ? `Current page, Page ${page}` : `Go to page ${page}`}"
        >
          ${page}
        </a>
      </li>
    `;
  }

  function createEllipsis(currentPage, totalPages, direction) {
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
          href="?page=${targetPage}"
          data-ellipsis="${direction}"
          aria-label="${direction === "prev" ? "Jump backward 5 pages" : "Jump forward 5 pages"}"
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
    let url = new URL(window.location.href);
    let page = parseInt(url.searchParams.get("page"), 10);

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
