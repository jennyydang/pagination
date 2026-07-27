(function () {
  // ########################## //
  // ### PRIVATE PROPERTIES ### //
  // ########################## //

  var rootClass = "pagination"; // -- the shared BEM root class every pagination component is built from
  var typePrefix = rootClass.charAt(0); // -- first letter of the root class, used below to derive an object name
  var objectName = rootClass.replace(typePrefix + "-", ""); // -- strips a leading "x-" prefix (if any) to get a clean object name
  var components; // -- the live collection of every ".pagination" element on the page
  const jumpSize = 5; // -- how many pages the ellipsis "jump" controls skip forward or backward
  const siblingCount = 2; // -- how many page numbers to show on either side of the current page

  // -- Verify if manager exists
  var $SUPER = this.Rexus ? this.Rexus : false; // -- grab the shared Rexus manager off the global scope, or false if missing
  if (!$SUPER) {
    // -- bail out entirely when the manager was never preloaded
    console.error('Rexus Manager needs to be preloaded for the "' + rootClass + '" to work'); // -- explain why the module refused to run
    return; // -- stop executing the rest of this IIFE
  }

  // -- Verify if any dependecies are needed
  /*
        Format is very much the same as the condition above
    */

  let stateMap = new Map(); // -- maps a component's id to its { currentPage, totalPages, urlPattern, ... } state

  // ################### //
  // ### CONSTRUCTOR ### //
  // ################### //
  function Pagination() {
    // ######################### //
    // ### PUBLIC PROPERTIES ### //
    // ######################### //

    components = document.getElementsByClassName(rootClass); // -- find every pagination component currently on the page
    if (components) {
      // -- only proceed when at least the collection itself exists
      let component; // -- holds the component being set up on each pass of the loop below
      for (let a = components.length - 1; a >= 0; a--) {
        // -- walk every found component, back to front
        component = components[a]; // -- the component being set up this pass
        component.id = window.Rexus.cuid.generate("pagination"); // -- give it a fresh, unique id used to key its state

        let currentPage = parseInt(component.dataset.currentPage, 10) || 1; // -- the page marked active, read from the markup
        let totalPages = parseInt(component.dataset.totalPages, 10) || 1; // -- how many pages exist in total, read from the markup
        if (currentPage < 1) currentPage = 1; // -- never allow the current page to fall below the first page
        if (currentPage > totalPages) currentPage = totalPages; // -- never allow the current page to exceed the last page

        stateMap.set(component.id, {
          // -- store this component's state, keyed by its id
          currentPage: currentPage, // -- the page currently marked active
          totalPages: totalPages, // -- how many pages exist in total
          urlPattern: component.dataset.urlPattern || "?page={page}", // -- the href template used to build every page link
          liveRegion: null, // -- filled in by render(), used to announce page changes
          errorEl: null, // -- filled in by render(), holds the mobile input's validation message
        });

        component.addEventListener("click", onClick); // -- listen for clicks anywhere inside this component
        component.addEventListener("submit", onSubmit); // -- listen for the mobile go-to-page form being submitted

        render(component); // -- build this component's desktop and mobile markup for the first time
      }
    }
  }

  // ###################### //
  // ### PUBLIC METHODS ### //
  // ###################### //

  // -- push a new current page and/or total page count into an existing component, then re-render it
  Pagination.prototype.update = function (componentOrId, options) {
    // -- componentOrId: an element or its id, options: { currentPage, totalPages, urlPattern }
    let component = typeof componentOrId === "string" ? document.getElementById(componentOrId) : componentOrId; // -- resolve whichever form was passed in
    if (!component) return; // -- nothing to update if the component can't be found

    let state = stateMap.get(component.id); // -- look up this component's stored state
    if (!state) return; // -- nothing to update if this component was never initialized

    options = options || {}; // -- default to an empty object when nothing was passed in
    if (typeof options.totalPages !== "undefined") state.totalPages = Math.max(options.totalPages, 1); // -- update the total, never letting it drop below 1
    if (typeof options.currentPage !== "undefined") state.currentPage = clamp(options.currentPage, 1, state.totalPages); // -- update the current page, kept in range
    if (typeof options.urlPattern !== "undefined") state.urlPattern = options.urlPattern; // -- update the href template if a new one was supplied

    render(component); // -- rebuild the markup to reflect the new state
    announce(state, "Page " + state.currentPage + " of " + state.totalPages); // -- tell screen reader users the page changed
  };

  // -- remove a component's listeners, markup, and stored state
  Pagination.prototype.destroy = function (componentOrId) {
    // -- componentOrId: an element or its id
    let component = typeof componentOrId === "string" ? document.getElementById(componentOrId) : componentOrId; // -- resolve whichever form was passed in
    if (!component) return; // -- nothing to destroy if the component can't be found

    component.removeEventListener("click", onClick); // -- stop listening for clicks
    component.removeEventListener("submit", onSubmit); // -- stop listening for form submits
    component.innerHTML = ""; // -- empty out the rendered markup
    stateMap.delete(component.id); // -- forget about this component's state
  };

  // ####################### //
  // ### PRIVATE METHODS ### //
  // ####################### //

  // -- keep a number pinned between a minimum and maximum value
  function clamp(value, min, max) {
    // -- value: the number to constrain, min/max: the inclusive bounds
    return Math.min(Math.max(value, min), max); // -- push value up to min or down to max as needed, otherwise leave it alone
  }

  // -- work out which page numbers and ellipses should render for the current state
  function getPageRange(current, total) {
    // -- current: the active page, total: how many pages exist
    let start = current - siblingCount; // -- left edge of the sibling window, may fall below 1
    let end = current + siblingCount; // -- right edge of the sibling window, may exceed total

    if (start < 1) {
      // -- the window ran off the start of the range
      end += 1 - start; // -- push the right edge out by the same amount the left edge overshot
      start = 1; // -- clamp the left edge back to the first page
    }
    if (end > total) {
      // -- the window ran off the end of the range
      start -= end - total; // -- push the left edge back by the same amount the right edge overshot
      end = total; // -- clamp the right edge back to the last page
    }
    start = Math.max(start, 1); // -- guard against a negative left edge on very small totals
    end = Math.min(end, total); // -- guard against an oversized right edge on very small totals

    let showLeftEllipsis = start > 2; // -- only show a left ellipsis when there's an actual gap after page 1
    let showRightEllipsis = end < total - 1; // -- only show a right ellipsis when there's an actual gap before the last page

    if (!showLeftEllipsis) start = 1; // -- no gap means page 1 should just merge into the window
    if (!showRightEllipsis) end = total; // -- no gap means the last page should just merge into the window

    let items = []; // -- the final, ordered list of page/ellipsis descriptors

    if (showLeftEllipsis) {
      // -- only add page 1 and a left ellipsis when there's a real gap
      items.push({ type: "page", page: 1 }); // -- always show the first page
      items.push({ type: "ellipsis", direction: "prev" }); // -- represents the hidden pages between 1 and the window
    }

    for (let page = start; page <= end; page++) {
      // -- walk every page inside the sibling window
      items.push({ type: "page", page: page }); // -- add each one as a plain page item
    }

    if (showRightEllipsis) {
      // -- only add a right ellipsis and the last page when there's a real gap
      items.push({ type: "ellipsis", direction: "next" }); // -- represents the hidden pages between the window and the last page
      items.push({ type: "page", page: total }); // -- always show the last page
    }

    return items; // -- hand the finished list back to the caller
  }

  // -- build the href for a given page number using a component's url pattern
  function buildUrl(state, page) {
    // -- state: the component's stored state, page: the target page number
    return state.urlPattern.replace("{page}", String(page)); // -- swap the {page} token for the real page number
  }

  // -- rebuild both the desktop and mobile markup for one component from its stored state
  function render(component) {
    // -- component: the element being (re)rendered
    let state = stateMap.get(component.id); // -- look up this component's stored state
    if (!state) return; // -- nothing to render without state

    let focusTarget = captureFocus(component); // -- remember what was focused before we wipe the markup

    component.innerHTML = ""; // -- clear out any previously rendered markup
    if (!component.hasAttribute("aria-label")) component.setAttribute("aria-label", "Pagination"); // -- name the landmark for screen readers if it isn't already named

    state.liveRegion = document.createElement("div"); // -- a hidden element used to announce page changes
    state.liveRegion.className = "pagination__status u-visually-hidden"; // -- visually hidden but still readable by screen readers
    state.liveRegion.setAttribute("aria-live", "polite"); // -- announce changes without interrupting the user
    state.liveRegion.setAttribute("aria-atomic", "true"); // -- always read the whole message, not just the changed part

    component.appendChild(state.liveRegion); // -- attach the live region first so it exists before anything else
    component.appendChild(renderDesktop(component, state)); // -- attach the "< [1] 2 3 4 5 … 50 >" desktop layout
    component.appendChild(renderMobile(component, state)); // -- attach the "< 1 / 50 >" mobile layout

    restoreFocus(component, focusTarget); // -- put focus back where the user had it, if possible
  }

  // -- build the desktop layout: prev button, page list, next button
  function renderDesktop(component, state) {
    // -- component: the element being rendered, state: its stored state
    let nav = document.createElement("div"); // -- wraps the whole desktop layout
    nav.className = "pagination__desktop"; // -- hidden below the breakpoint, a flex row above it

    let list = document.createElement("ul"); // -- holds the page number and ellipsis items only
    list.className = "pagination__list"; // -- styled as a horizontal, wrapping list

    let range = getPageRange(state.currentPage, state.totalPages); // -- work out which items belong in the list
    for (let i = 0; i < range.length; i++) {
      // -- walk each descriptor in order
      let item = range[i]; // -- the current descriptor, either a page or an ellipsis
      if (item.type === "page") list.appendChild(buildPageItem(state, item.page)); // -- add a page number link
      else list.appendChild(buildEllipsisItem(state, item.direction)); // -- add a jump-5 ellipsis control
    }

    let prev = buildArrowButton("prev", "Previous page", "‹", state.currentPage <= 1); // -- moves back one page
    let next = buildArrowButton("next", "Next page", "›", state.currentPage >= state.totalPages); // -- moves forward one page

    nav.appendChild(prev); // -- the prev button sits before the list, outside of it
    nav.appendChild(list); // -- the list of page numbers sits in the middle
    nav.appendChild(next); // -- the next button sits after the list, outside of it

    return nav; // -- hand the finished desktop markup back to the caller
  }

  // -- build a single prev/next arrow <button>
  function buildArrowButton(action, label, glyph, disabled) {
    // -- action: "prev"/"next", label: aria-label text, glyph: visible character, disabled: boolean
    let button = document.createElement("button"); // -- arrows are always real buttons, never anchors
    button.type = "button"; // -- stop it from ever behaving like a form submit button
    button.className = "pagination__arrow pagination__arrow--" + action; // -- shared arrow styling plus a direction modifier
    button.setAttribute("aria-label", label); // -- give screen readers a clear description since the glyph alone isn't enough
    button.dataset.action = action; // -- read by the click handler to know which arrow was pressed

    if (disabled) {
      // -- only true at the very first or very last page
      button.disabled = true; // -- stops the button from being focusable or clickable
      button.setAttribute("aria-disabled", "true"); // -- reinforces the disabled state for assistive tech
    }

    let icon = document.createElement("span"); // -- wraps the visible glyph separately from the accessible label
    icon.className = "pagination__arrow-icon"; // -- purely presentational styling hook
    icon.setAttribute("aria-hidden", "true"); // -- hide the decorative glyph from screen readers
    icon.textContent = glyph; // -- the visible ‹ or › character
    button.appendChild(icon); // -- attach the glyph inside the button

    return button; // -- hand the finished button back to the caller
  }

  // -- build a single page number <a>
  function buildPageItem(state, page) {
    // -- state: the component's stored state, page: the page number this link represents
    let isCurrent = page === state.currentPage; // -- true when this link represents the active page

    let li = document.createElement("li"); // -- every page item is wrapped in a list item
    li.className = "pagination__item"; // -- shared list item styling

    let link = document.createElement("a"); // -- pages are always real anchors, never buttons
    link.className = "pagination__link"; // -- shared link styling
    link.href = buildUrl(state, page); // -- a real, working href so the link still works without JavaScript
    link.textContent = String(page); // -- the visible page number
    link.dataset.page = String(page); // -- read by the click handler to know which page was pressed

    if (isCurrent) {
      // -- extra treatment for whichever page is currently active
      link.classList.add("pagination__link--current"); // -- visually highlight the active page
      link.setAttribute("aria-current", "page"); // -- tell assistive tech this is the current page
      link.setAttribute("aria-label", "Page " + page + ", current page"); // -- spell out the state for screen readers
    } else {
      // -- every other, non-active page
      link.setAttribute("aria-label", "Page " + page); // -- a plain, unambiguous label
    }

    li.appendChild(link); // -- attach the anchor inside the list item
    return li; // -- hand the finished list item back to the caller
  }

  // -- build a single ellipsis <button> that swaps to a jump-5 control on hover/focus
  function buildEllipsisItem(state, direction) {
    // -- state: the component's stored state, direction: "prev" or "next"
    let target =
      direction === "prev"
        ? clamp(state.currentPage - jumpSize, 1, state.totalPages) // -- jump backward, but never past page 1
        : clamp(state.currentPage + jumpSize, 1, state.totalPages); // -- jump forward, but never past the last page

    let li = document.createElement("li"); // -- ellipses live inside the page list just like page items
    li.className = "pagination__item pagination__item--ellipsis"; // -- shared list item styling plus an ellipsis modifier

    let button = document.createElement("button"); // -- the ellipsis is an action, so it's a button rather than a link
    button.type = "button"; // -- stop it from ever behaving like a form submit button
    button.className = "pagination__ellipsis"; // -- styling hook for the hover/focus glyph swap
    button.dataset.action = direction === "prev" ? "jump-prev" : "jump-next"; // -- read by the click handler to know which jump was pressed
    button.dataset.page = String(target); // -- the resolved target page, read by the click handler
    button.setAttribute(
      // -- describe exactly what will happen if this control is activated
      "aria-label",
      direction === "prev"
        ? "Jump back " + jumpSize + " pages to page " + target // -- wording for the left-hand ellipsis
        : "Jump forward " + jumpSize + " pages to page " + target, // -- wording for the right-hand ellipsis
    );

    let dots = document.createElement("span"); // -- the default "…" glyph
    dots.className = "pagination__ellipsis-dots"; // -- hidden on hover/focus via CSS
    dots.setAttribute("aria-hidden", "true"); // -- purely decorative, the button's aria-label already covers meaning
    dots.textContent = "…"; // -- the visible character shown at rest

    let arrow = document.createElement("span"); // -- the "«"/"»" glyph shown on hover/focus
    arrow.className = "pagination__ellipsis-arrow"; // -- hidden by default, shown on hover/focus via CSS
    arrow.setAttribute("aria-hidden", "true"); // -- purely decorative, the button's aria-label already covers meaning
    arrow.textContent = direction === "prev" ? "«" : "»"; // -- pick the glyph that matches the jump direction

    button.appendChild(dots); // -- attach the resting glyph
    button.appendChild(arrow); // -- attach the hover/focus glyph
    li.appendChild(button); // -- attach the button inside the list item

    return li; // -- hand the finished list item back to the caller
  }

  // -- build the mobile layout: prev button, editable page input, next button
  function renderMobile(component, state) {
    // -- component: the element being rendered, state: its stored state
    let wrap = document.createElement("div"); // -- wraps the whole mobile layout
    wrap.className = "pagination__mobile"; // -- hidden above the breakpoint, a flex row below it

    let prev = buildArrowButton("prev", "Previous page", "‹", state.currentPage <= 1); // -- moves back one page
    let next = buildArrowButton("next", "Next page", "›", state.currentPage >= state.totalPages); // -- moves forward one page

    let form = document.createElement("form"); // -- wraps the input so pressing Enter submits it naturally
    form.className = "pagination__goto"; // -- shared styling hook
    form.dataset.gotoForm = ""; // -- marks this form as the one the submit handler should react to
    form.setAttribute("role", "group"); // -- groups the label/input/total together for assistive tech
    form.setAttribute("aria-label", "Go to page"); // -- names the group
    form.noValidate = true; // -- disable native validation so our own error message can run instead

    let inputId = component.id + "-goto-input"; // -- unique id so the <label> can point at the <input>
    let errorId = component.id + "-goto-error"; // -- unique id so the <input> can point at its error message

    let label = document.createElement("label"); // -- an accessible label the sighted layout doesn't otherwise show
    label.className = "u-visually-hidden"; // -- hidden visually but still read by screen readers
    label.htmlFor = inputId; // -- associates the label with the input below
    label.textContent = "Page number, currently page " + state.currentPage + " of " + state.totalPages; // -- describes both the field and its current state

    let input = document.createElement("input"); // -- the editable "1" in "< 1 / 50 >"
    input.type = "number"; // -- only page numbers make sense here
    input.inputMode = "numeric"; // -- shows a numeric keyboard on mobile devices
    input.pattern = "[0-9]*"; // -- extra hint for older mobile browsers to show a numeric keypad
    input.className = "pagination__input"; // -- styling hook
    input.id = inputId; // -- referenced by the label above
    input.min = "1"; // -- communicates the valid range, even though we also validate manually
    input.max = String(state.totalPages); // -- communicates the valid range, even though we also validate manually
    input.value = String(state.currentPage); // -- always starts out showing the real current page
    input.autocomplete = "off"; // -- page numbers shouldn't be remembered by the browser
    input.setAttribute("aria-describedby", errorId); // -- links the input to its (possibly empty) error message
    input.dataset.pageInput = ""; // -- marks this input as the one the submit handler should read from

    let total = document.createElement("span"); // -- the "/ 50" half of "< 1 / 50 >"
    total.className = "pagination__total"; // -- styling hook
    total.setAttribute("aria-hidden", "true"); // -- the label above already announces the total, so hide this duplicate
    total.textContent = "/ " + state.totalPages; // -- the visible total page count

    let error = document.createElement("span"); // -- holds a validation message when the typed page is out of range
    error.className = "pagination__error u-visually-hidden"; // -- hidden until it actually has text in it
    error.id = errorId; // -- referenced by the input's aria-describedby above
    error.setAttribute("aria-live", "polite"); // -- announce the error as soon as it appears
    state.errorEl = error; // -- keep a reference so the submit handler can update it later

    form.appendChild(label); // -- label comes first for a sensible reading order
    form.appendChild(input); // -- then the editable page number
    form.appendChild(total); // -- then the total page count
    form.appendChild(error); // -- then the (usually empty) error message

    wrap.appendChild(prev); // -- the prev button sits before the form
    wrap.appendChild(form); // -- the go-to-page form sits in the middle
    wrap.appendChild(next); // -- the next button sits after the form

    return wrap; // -- hand the finished mobile markup back to the caller
  }

  //BROWSER
  function onClick(e) {
    // -- e: the click event, "this" is the component the listener was attached to
    let component = this; // -- the component this delegated listener belongs to
    let state = stateMap.get(component.id); // -- look up this component's stored state
    if (!state) return; // -- nothing to do without state

    let arrowButton = e.target.closest('[data-action="prev"], [data-action="next"]'); // -- was a prev/next arrow clicked?
    let jumpButton = e.target.closest('[data-action="jump-prev"], [data-action="jump-next"]'); // -- was an ellipsis jump clicked?
    let pageLink = e.target.closest("a[data-page]"); // -- was a page number clicked?

    if (arrowButton) {
      // -- handle the prev/next arrows first
      e.preventDefault(); // -- arrows have no href, but prevent default just in case
      let delta = arrowButton.dataset.action === "prev" ? -1 : 1; // -- move one page back or one page forward
      navigate(component, state, clamp(state.currentPage + delta, 1, state.totalPages)); // -- go to the resulting page, kept in range
      return; // -- nothing else to do for this click
    }

    if (jumpButton) {
      // -- handle the ellipsis jump controls next
      e.preventDefault(); // -- these are buttons with no href, but prevent default just in case
      navigate(component, state, parseInt(jumpButton.dataset.page, 10)); // -- go straight to the pre-computed target page
      return; // -- nothing else to do for this click
    }

    if (pageLink) {
      // -- handle a direct page number click last
      let page = parseInt(pageLink.dataset.page, 10); // -- read which page number was clicked
      e.preventDefault(); // -- we handle navigation ourselves instead of always doing a full page load
      if (page === state.currentPage) return; // -- clicking the already-active page should do nothing
      navigate(component, state, page); // -- go to the clicked page
    }
  }

  //BROWSER
  function onSubmit(e) {
    // -- e: the submit event, "this" is the component the listener was attached to
    if (!e.target.closest("[data-goto-form]")) return; // -- ignore submits that aren't from our own form
    e.preventDefault(); // -- we always handle this ourselves instead of a real form submission

    let component = this; // -- the component this delegated listener belongs to
    let state = stateMap.get(component.id); // -- look up this component's stored state
    if (!state) return; // -- nothing to do without state

    let input = e.target.querySelector("[data-page-input]"); // -- the editable page number field
    let raw = input.value.trim(); // -- the typed value, with any stray whitespace removed
    let page = Number(raw); // -- attempt to convert the typed value into a number

    if (!raw || !Number.isInteger(page) || page < 1 || page > state.totalPages) {
      // -- reject anything that isn't a whole number in range
      setInputError(state, "Enter a page number between 1 and " + state.totalPages + "."); // -- explain what went wrong
      input.focus(); // -- send focus back to the field so the user can fix it
      input.select(); // -- select the existing text so retyping is easy
      return; // -- stop here, don't navigate anywhere
    }

    setInputError(state, ""); // -- clear out any previous error message
    if (page === state.currentPage) return; // -- typing the already-active page should do nothing
    navigate(component, state, page); // -- go to the typed page
  }

  // -- update the (possibly empty) validation message under the mobile input
  function setInputError(state, message) {
    // -- state: the component's stored state, message: the text to show, or "" to clear it
    if (state.errorEl) state.errorEl.textContent = message; // -- guard against calling this before the first render
  }

  // -- move to a new page, either by firing a normal navigation or handing off to an AJAX listener
  function navigate(component, state, page) {
    // -- component: the element navigating, state: its stored state, page: the page being navigated to
    page = clamp(page, 1, state.totalPages); // -- always keep the requested page within range
    let previousPage = state.currentPage; // -- remember what page we're navigating away from
    let url = buildUrl(state, page); // -- work out the destination url

    let navigateEvent = new CustomEvent("pagination:navigate", {
      // -- a cancelable event any listener can hook into
      bubbles: true, // -- let the event travel up the DOM so page-level listeners can catch it
      cancelable: true, // -- allow listeners to opt out of the default full-page navigation
      detail: { page: page, previousPage: previousPage, totalPages: state.totalPages, url: url }, // -- everything a listener needs to fetch new content
    });

    let proceedWithDefault = component.dispatchEvent(navigateEvent); // -- false if any listener called preventDefault()

    if (proceedWithDefault) window.location.assign(url); // -- no one intercepted it, so do a normal browser navigation
    // -- otherwise, whoever called preventDefault() is responsible for calling Pagination.update(component, { currentPage: page })
  }

  // -- announce a message to screen reader users via the hidden live region
  function announce(state, message) {
    // -- state: the component's stored state, message: the text to read out
    if (state.liveRegion) state.liveRegion.textContent = message; // -- guard against calling this before the first render
  }

  // -- remember which element (if any) inside a component currently has focus
  function captureFocus(component) {
    // -- component: the element being re-rendered
    let active = component.contains(document.activeElement) ? document.activeElement : null; // -- only care about focus inside this component
    if (!active) return null; // -- nothing to remember
    return { action: active.dataset.action || null, page: active.dataset.page || null }; // -- enough detail to find an equivalent element after re-render
  }

  // -- put focus back on the element that best matches what was focused before the last render
  function restoreFocus(component, focusTarget) {
    // -- component: the element that was just re-rendered, focusTarget: whatever captureFocus() returned earlier
    if (!focusTarget) return; // -- nothing was focused before, so there's nothing to restore

    let next = null; // -- the element we'll try to refocus
    if (focusTarget.action) next = component.querySelector('[data-action="' + focusTarget.action + '"]:not([disabled])'); // -- prefer matching the same arrow/jump action
    else if (focusTarget.page) next = component.querySelector('a[data-page="' + focusTarget.page + '"]'); // -- otherwise match the same page number

    if (next) next.focus(); // -- only move focus if a matching element actually exists
  }

  // -- initiate into Rexus object
  $SUPER[objectName] = new Pagination(); // -- run the constructor and expose update()/destroy() under Rexus.pagination
})();
