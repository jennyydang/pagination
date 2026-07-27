(function () {
  // ########################## //
  // ### PRIVATE PROPERTIES ### //
  // ########################## //
  /*
        These act as a "const" variables, a type of variables that
        act as a global and aren't inteded to be redifined within the class module.
    */
  var rootClass = "pagination"; // -- the shared BEM root class every pagination component is built from
  var typePrefix = rootClass.charAt(0); // -- first letter of the root class, used below to derive an object name
  var objectName = rootClass.replace(typePrefix + "-", ""); // -- strips a leading "x-" prefix (if any) to get a clean object name
  const jumpSize = 5; // -- how many pages the ellipsis "jump" controls skip forward or backward
  const siblingCount = 2; // -- how many page numbers to show on either side of the current page
  var instanceCount = 0; // -- running count of instances created so far, used to build a fallback id
  var registry = {}; // -- maps a component's id back to its Pagination instance

  // -- Verify if manager exists
  /*
        The manager is intended to be as a service to the other modules
        you can (should) register the module to the manager using it's ID
        so that it can be quickly referenced when cross-communication is needed
    */
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
  // -- (this module has no dependencies beyond the Rexus manager itself)

  // ################### //
  // ### CONSTRUCTOR ### //
  // ################### //
  /*
        The constructor sets the base for this module
            - Detects all instances of component/element
            - Identifies and registers all instances
            - Sets any private variables to be used globally
            - Should inherit a similar naming convention except with a capital in the beginning
    */
  function Pagination(component) {
    // -- component: one root ".pagination" element this instance will control
    // ######################### //
    // ### PUBLIC PROPERTIES ### //
    // ######################### //
    /*
            Not common nor is it best practice
            consider using getter/setter methods
        */
    var self = this; // -- keep a stable reference to this instance for use inside nested closures

    if (!component) return; // -- do nothing if no matching element was ever passed in

    instanceCount++; // -- bump the shared counter so every fallback id stays unique
    component.id = component.id || typePrefix + objectName + instanceCount; // -- give the component a stable id if it doesn't already have one

    self.component = component; // -- the root <nav class="pagination"> element
    self.id = component.id; // -- cache the id locally for quick access
    self.currentPage = parseInt(component.dataset.currentPage, 10) || 1; // -- the page currently marked active, read from the markup
    self.totalPages = parseInt(component.dataset.totalPages, 10) || 1; // -- how many pages exist in total, read from the markup
    self.urlPattern = component.dataset.urlPattern || "?page={page}"; // -- the href template used to build every page link

    if (self.currentPage < 1) self.currentPage = 1; // -- never allow the current page to fall below the first page
    if (self.currentPage > self.totalPages) self.currentPage = self.totalPages; // -- never allow the current page to exceed the last page

    registry[self.id] = self; // -- store this instance so it can be looked up again later

    // -- apply event listeners
    self.onClick = function (e) {
      onClick(self, e);
    }; // -- delegated click handler for arrows, page links, and ellipsis jumps
    self.onSubmit = function (e) {
      onSubmit(self, e);
    }; // -- handles the mobile "go to page" form being submitted

    component.addEventListener("click", self.onClick); // -- listen for clicks anywhere inside the component
    component.addEventListener("submit", self.onSubmit); // -- listen for the mobile go-to-page form being submitted

    render(self); // -- build the desktop and mobile markup for the first time
  }

  // ###################### //
  // ### PUBLIC METHODS ### //
  // ###################### //
  /*
        Place useful methods that can be featured publicly
        Common features usually consists of
            - Update (one or all components)
            - Refresh (one or all components)
            - Getter (receive component data)
            - Setter (define new component properties)
    */

  // -- update this instance with a new current page and/or total page count, then re-render
  Pagination.prototype.update = function (options) {
    // -- options: { currentPage, totalPages, urlPattern }
    var self = this; // -- keep a stable reference to this instance
    options = options || {}; // -- default to an empty object when nothing was passed in

    if (typeof options.totalPages !== "undefined") self.totalPages = Math.max(options.totalPages, 1); // -- update the total, never letting it drop below 1
    if (typeof options.currentPage !== "undefined") self.currentPage = clamp(options.currentPage, 1, self.totalPages); // -- update the current page, kept in range
    if (typeof options.urlPattern !== "undefined") self.urlPattern = options.urlPattern; // -- update the href template if a new one was supplied

    render(self); // -- rebuild the markup to reflect the new state
    announce(self, "Page " + self.currentPage + " of " + self.totalPages); // -- tell screen reader users the page changed
  };

  // -- tear down this instance, removing its listeners and emptying its markup
  Pagination.prototype.destroy = function () {
    var self = this; // -- keep a stable reference to this instance

    self.component.removeEventListener("click", self.onClick); // -- stop listening for clicks
    self.component.removeEventListener("submit", self.onSubmit); // -- stop listening for form submits
    self.component.innerHTML = ""; // -- empty out the rendered markup
    delete registry[self.id]; // -- forget about this instance
  };

  // ####################### //
  // ### PRIVATE METHODS ### //
  // ####################### //
  /*
        These methods are only accessible only within this class module
        they act as a service to help complete the module during initiation
    */

  // -- keep a number pinned between a minimum and maximum value
  function clamp(value, min, max) {
    // -- value: the number to constrain, min/max: the inclusive bounds
    return Math.min(Math.max(value, min), max); // -- push value up to min or down to max as needed, otherwise leave it alone
  }

  // -- work out which page numbers and ellipses should render for the current state
  function getPageRange(current, total) {
    // -- current: the active page, total: how many pages exist
    var start = current - siblingCount; // -- left edge of the sibling window, may fall below 1
    var end = current + siblingCount; // -- right edge of the sibling window, may exceed total

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

    var showLeftEllipsis = start > 2; // -- only show a left ellipsis when there's an actual gap after page 1
    var showRightEllipsis = end < total - 1; // -- only show a right ellipsis when there's an actual gap before the last page

    if (!showLeftEllipsis) start = 1; // -- no gap means page 1 should just merge into the window
    if (!showRightEllipsis) end = total; // -- no gap means the last page should just merge into the window

    var items = []; // -- the final, ordered list of page/ellipsis descriptors

    if (showLeftEllipsis) {
      // -- only add page 1 and a left ellipsis when there's a real gap
      items.push({ type: "page", page: 1 }); // -- always show the first page
      items.push({ type: "ellipsis", direction: "prev" }); // -- represents the hidden pages between 1 and the window
    }

    for (var page = start; page <= end; page++) {
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

  // -- build the href for a given page number using this instance's url pattern
  function buildUrl(self, page) {
    // -- self: the instance, page: the target page number
    return self.urlPattern.replace("{page}", String(page)); // -- swap the {page} token for the real page number
  }

  // -- rebuild both the desktop and mobile markup from the current instance state
  function render(self) {
    // -- self: the instance being (re)rendered
    var focusTarget = captureFocus(self); // -- remember what was focused before we wipe the markup

    self.component.innerHTML = ""; // -- clear out any previously rendered markup
    if (!self.component.hasAttribute("aria-label")) self.component.setAttribute("aria-label", "Pagination"); // -- name the landmark for screen readers if it isn't already named

    self.liveRegion = document.createElement("div"); // -- a hidden element used to announce page changes
    self.liveRegion.className = "pagination__status u-visually-hidden"; // -- visually hidden but still readable by screen readers
    self.liveRegion.setAttribute("aria-live", "polite"); // -- announce changes without interrupting the user
    self.liveRegion.setAttribute("aria-atomic", "true"); // -- always read the whole message, not just the changed part

    var desktop = renderDesktop(self); // -- build the "< [1] 2 3 4 5 … 50 >" desktop markup
    var mobile = renderMobile(self); // -- build the "< 1 / 50 >" mobile markup

    self.component.appendChild(self.liveRegion); // -- attach the live region first so it exists before anything else
    self.component.appendChild(desktop); // -- attach the desktop layout
    self.component.appendChild(mobile); // -- attach the mobile layout

    restoreFocus(self, focusTarget); // -- put focus back where the user had it, if possible
  }

  // -- build the desktop layout: prev button, page list, next button
  function renderDesktop(self) {
    // -- self: the instance being rendered
    var nav = document.createElement("div"); // -- wraps the whole desktop layout
    nav.className = "pagination__desktop"; // -- hidden below the breakpoint, a flex row above it

    var list = document.createElement("ul"); // -- holds the page number and ellipsis items only
    list.className = "pagination__list"; // -- styled as a horizontal, wrapping list

    var range = getPageRange(self.currentPage, self.totalPages); // -- work out which items belong in the list
    for (var i = 0; i < range.length; i++) {
      // -- walk each descriptor in order
      var item = range[i]; // -- the current descriptor, either a page or an ellipsis
      if (item.type === "page") list.appendChild(buildPageItem(self, item.page)); // -- add a page number link
      else list.appendChild(buildEllipsisItem(self, item.direction)); // -- add a jump-5 ellipsis control
    }

    var prev = buildArrowButton(self, "prev", "Previous page", "‹", self.currentPage <= 1); // -- moves back one page
    var next = buildArrowButton(self, "next", "Next page", "›", self.currentPage >= self.totalPages); // -- moves forward one page

    nav.appendChild(prev); // -- the prev button sits before the list, outside of it
    nav.appendChild(list); // -- the list of page numbers sits in the middle
    nav.appendChild(next); // -- the next button sits after the list, outside of it

    return nav; // -- hand the finished desktop markup back to the caller
  }

  // -- build a single prev/next arrow <button>
  function buildArrowButton(self, action, label, glyph, disabled) {
    // -- action: "prev"/"next", label: aria-label text, glyph: visible character, disabled: boolean
    var button = document.createElement("button"); // -- arrows are always real buttons, never anchors
    button.type = "button"; // -- stop it from ever behaving like a form submit button
    button.className = "pagination__arrow pagination__arrow--" + action; // -- shared arrow styling plus a direction modifier
    button.setAttribute("aria-label", label); // -- give screen readers a clear description since the glyph alone isn't enough
    button.dataset.action = action; // -- read by the click handler to know which arrow was pressed
    button.dataset.root = self.id; // -- links this button back to its owning component

    if (disabled) {
      // -- only true at the very first or very last page
      button.disabled = true; // -- stops the button from being focusable or clickable
      button.setAttribute("aria-disabled", "true"); // -- reinforces the disabled state for assistive tech
    }

    var icon = document.createElement("span"); // -- wraps the visible glyph separately from the accessible label
    icon.className = "pagination__arrow-icon"; // -- purely presentational styling hook
    icon.setAttribute("aria-hidden", "true"); // -- hide the decorative glyph from screen readers
    icon.textContent = glyph; // -- the visible ‹ or › character
    button.appendChild(icon); // -- attach the glyph inside the button

    return button; // -- hand the finished button back to the caller
  }

  // -- build a single page number <a>
  function buildPageItem(self, page) {
    // -- self: the instance, page: the page number this link represents
    var isCurrent = page === self.currentPage; // -- true when this link represents the active page

    var li = document.createElement("li"); // -- every page item is wrapped in a list item
    li.className = "pagination__item"; // -- shared list item styling

    var link = document.createElement("a"); // -- pages are always real anchors, never buttons
    link.className = "pagination__link"; // -- shared link styling
    link.href = buildUrl(self, page); // -- a real, working href so the link still works without JavaScript
    link.textContent = String(page); // -- the visible page number
    link.dataset.page = String(page); // -- read by the click handler to know which page was pressed
    link.dataset.root = self.id; // -- links this anchor back to its owning component

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
  function buildEllipsisItem(self, direction) {
    // -- self: the instance, direction: "prev" or "next"
    var target =
      direction === "prev"
        ? clamp(self.currentPage - jumpSize, 1, self.totalPages) // -- jump backward, but never past page 1
        : clamp(self.currentPage + jumpSize, 1, self.totalPages); // -- jump forward, but never past the last page

    var li = document.createElement("li"); // -- ellipses live inside the page list just like page items
    li.className = "pagination__item pagination__item--ellipsis"; // -- shared list item styling plus an ellipsis modifier

    var button = document.createElement("button"); // -- the ellipsis is an action, so it's a button rather than a link
    button.type = "button"; // -- stop it from ever behaving like a form submit button
    button.className = "pagination__ellipsis"; // -- styling hook for the hover/focus glyph swap
    button.dataset.action = direction === "prev" ? "jump-prev" : "jump-next"; // -- read by the click handler to know which jump was pressed
    button.dataset.page = String(target); // -- the resolved target page, read by the click handler
    button.dataset.root = self.id; // -- links this button back to its owning component
    button.setAttribute(
      // -- describe exactly what will happen if this control is activated
      "aria-label",
      direction === "prev"
        ? "Jump back " + jumpSize + " pages to page " + target // -- wording for the left-hand ellipsis
        : "Jump forward " + jumpSize + " pages to page " + target, // -- wording for the right-hand ellipsis
    );

    var dots = document.createElement("span"); // -- the default "…" glyph
    dots.className = "pagination__ellipsis-dots"; // -- hidden on hover/focus via CSS
    dots.setAttribute("aria-hidden", "true"); // -- purely decorative, the button's aria-label already covers meaning
    dots.textContent = "…"; // -- the visible character shown at rest

    var arrow = document.createElement("span"); // -- the "«"/"»" glyph shown on hover/focus
    arrow.className = "pagination__ellipsis-arrow"; // -- hidden by default, shown on hover/focus via CSS
    arrow.setAttribute("aria-hidden", "true"); // -- purely decorative, the button's aria-label already covers meaning
    arrow.textContent = direction === "prev" ? "«" : "»"; // -- pick the glyph that matches the jump direction

    button.appendChild(dots); // -- attach the resting glyph
    button.appendChild(arrow); // -- attach the hover/focus glyph
    li.appendChild(button); // -- attach the button inside the list item

    return li; // -- hand the finished list item back to the caller
  }

  // -- build the mobile layout: prev button, editable page input, next button
  function renderMobile(self) {
    // -- self: the instance being rendered
    var wrap = document.createElement("div"); // -- wraps the whole mobile layout
    wrap.className = "pagination__mobile"; // -- hidden above the breakpoint, a flex row below it

    var prev = buildArrowButton(self, "prev", "Previous page", "‹", self.currentPage <= 1); // -- moves back one page
    var next = buildArrowButton(self, "next", "Next page", "›", self.currentPage >= self.totalPages); // -- moves forward one page

    var form = document.createElement("form"); // -- wraps the input so pressing Enter submits it naturally
    form.className = "pagination__goto"; // -- shared styling hook
    form.dataset.gotoForm = ""; // -- marks this form as the one the submit handler should react to
    form.dataset.root = self.id; // -- links this form back to its owning component
    form.setAttribute("role", "group"); // -- groups the label/input/total together for assistive tech
    form.setAttribute("aria-label", "Go to page"); // -- names the group
    form.noValidate = true; // -- disable native validation so our own error message can run instead

    var inputId = self.id + "-goto-input"; // -- unique id so the <label> can point at the <input>
    var errorId = self.id + "-goto-error"; // -- unique id so the <input> can point at its error message

    var label = document.createElement("label"); // -- an accessible label the sighted layout doesn't otherwise show
    label.className = "u-visually-hidden"; // -- hidden visually but still read by screen readers
    label.htmlFor = inputId; // -- associates the label with the input below
    label.textContent = "Page number, currently page " + self.currentPage + " of " + self.totalPages; // -- describes both the field and its current state

    var input = document.createElement("input"); // -- the editable "1" in "< 1 / 50 >"
    input.type = "number"; // -- only page numbers make sense here
    input.inputMode = "numeric"; // -- shows a numeric keyboard on mobile devices
    input.pattern = "[0-9]*"; // -- extra hint for older mobile browsers to show a numeric keypad
    input.className = "pagination__input"; // -- styling hook
    input.id = inputId; // -- referenced by the label above
    input.min = "1"; // -- communicates the valid range, even though we also validate manually
    input.max = String(self.totalPages); // -- communicates the valid range, even though we also validate manually
    input.value = String(self.currentPage); // -- always starts out showing the real current page
    input.autocomplete = "off"; // -- page numbers shouldn't be remembered by the browser
    input.setAttribute("aria-describedby", errorId); // -- links the input to its (possibly empty) error message
    input.dataset.pageInput = ""; // -- marks this input as the one the submit handler should read from

    var total = document.createElement("span"); // -- the "/ 50" half of "< 1 / 50 >"
    total.className = "pagination__total"; // -- styling hook
    total.setAttribute("aria-hidden", "true"); // -- the label above already announces the total, so hide this duplicate
    total.textContent = "/ " + self.totalPages; // -- the visible total page count

    var error = document.createElement("span"); // -- holds a validation message when the typed page is out of range
    error.className = "pagination__error u-visually-hidden"; // -- hidden until it actually has text in it
    error.id = errorId; // -- referenced by the input's aria-describedby above
    error.setAttribute("aria-live", "polite"); // -- announce the error as soon as it appears
    self.errorEl = error; // -- keep a reference so the submit handler can update it later

    form.appendChild(label); // -- label comes first for a sensible reading order
    form.appendChild(input); // -- then the editable page number
    form.appendChild(total); // -- then the total page count
    form.appendChild(error); // -- then the (usually empty) error message

    wrap.appendChild(prev); // -- the prev button sits before the form
    wrap.appendChild(form); // -- the go-to-page form sits in the middle
    wrap.appendChild(next); // -- the next button sits after the form

    return wrap; // -- hand the finished mobile markup back to the caller
  }

  // -- shared click handler for both the desktop and mobile layouts
  function onClick(self, e) {
    // -- self: the instance, e: the click event
    var arrowButton = e.target.closest('[data-action="prev"], [data-action="next"]'); // -- was a prev/next arrow clicked?
    var jumpButton = e.target.closest('[data-action="jump-prev"], [data-action="jump-next"]'); // -- was an ellipsis jump clicked?
    var pageLink = e.target.closest("a[data-page]"); // -- was a page number clicked?

    if (arrowButton) {
      // -- handle the prev/next arrows first
      e.preventDefault(); // -- arrows have no href, but prevent default just in case
      var delta = arrowButton.dataset.action === "prev" ? -1 : 1; // -- move one page back or one page forward
      navigate(self, clamp(self.currentPage + delta, 1, self.totalPages)); // -- go to the resulting page, kept in range
      return; // -- nothing else to do for this click
    }

    if (jumpButton) {
      // -- handle the ellipsis jump controls next
      e.preventDefault(); // -- these are buttons with no href, but prevent default just in case
      navigate(self, parseInt(jumpButton.dataset.page, 10)); // -- go straight to the pre-computed target page
      return; // -- nothing else to do for this click
    }

    if (pageLink) {
      // -- handle a direct page number click last
      var page = parseInt(pageLink.dataset.page, 10); // -- read which page number was clicked
      e.preventDefault(); // -- we handle navigation ourselves instead of always doing a full page load
      if (page === self.currentPage) return; // -- clicking the already-active page should do nothing
      navigate(self, page); // -- go to the clicked page
    }
  }

  // -- handles the mobile "go to page" form being submitted
  function onSubmit(self, e) {
    // -- self: the instance, e: the submit event
    if (!e.target.closest("[data-goto-form]")) return; // -- ignore submits that aren't from our own form
    e.preventDefault(); // -- we always handle this ourselves instead of a real form submission

    var input = e.target.querySelector("[data-page-input]"); // -- the editable page number field
    var raw = input.value.trim(); // -- the typed value, with any stray whitespace removed
    var page = Number(raw); // -- attempt to convert the typed value into a number

    if (!raw || !Number.isInteger(page) || page < 1 || page > self.totalPages) {
      // -- reject anything that isn't a whole number in range
      setInputError(self, "Enter a page number between 1 and " + self.totalPages + "."); // -- explain what went wrong
      input.focus(); // -- send focus back to the field so the user can fix it
      input.select(); // -- select the existing text so retyping is easy
      return; // -- stop here, don't navigate anywhere
    }

    setInputError(self, ""); // -- clear out any previous error message
    if (page === self.currentPage) return; // -- typing the already-active page should do nothing
    navigate(self, page); // -- go to the typed page
  }

  // -- update the (possibly empty) validation message under the mobile input
  function setInputError(self, message) {
    // -- self: the instance, message: the text to show, or "" to clear it
    if (self.errorEl) self.errorEl.textContent = message; // -- guard against calling this before the first render
  }

  // -- move to a new page, either by firing a normal navigation or handing off to an AJAX listener
  function navigate(self, page) {
    // -- self: the instance, page: the page being navigated to
    page = clamp(page, 1, self.totalPages); // -- always keep the requested page within range
    var previousPage = self.currentPage; // -- remember what page we're navigating away from
    var url = buildUrl(self, page); // -- work out the destination url

    var navigateEvent = new CustomEvent("pagination:navigate", {
      // -- a cancelable event any listener can hook into
      bubbles: true, // -- let the event travel up the DOM so page-level listeners can catch it
      cancelable: true, // -- allow listeners to opt out of the default full-page navigation
      detail: { page: page, previousPage: previousPage, totalPages: self.totalPages, url: url }, // -- everything a listener needs to fetch new content
    });

    var proceedWithDefault = self.component.dispatchEvent(navigateEvent); // -- false if any listener called preventDefault()

    if (proceedWithDefault) window.location.assign(url); // -- no one intercepted it, so do a normal browser navigation
    // -- otherwise, whoever called preventDefault() is responsible for calling instance.update({ currentPage: page })
  }

  // -- announce a message to screen reader users via the hidden live region
  function announce(self, message) {
    // -- self: the instance, message: the text to read out
    if (self.liveRegion) self.liveRegion.textContent = message; // -- guard against calling this before the first render
  }

  // -- remember which element (if any) inside this component currently has focus
  function captureFocus(self) {
    // -- self: the instance
    var active = self.component.contains(document.activeElement) ? document.activeElement : null; // -- only care about focus inside this component
    if (!active) return null; // -- nothing to remember
    return { action: active.dataset.action || null, page: active.dataset.page || null }; // -- enough detail to find an equivalent element after re-render
  }

  // -- put focus back on the element that best matches what was focused before the last render
  function restoreFocus(self, focusTarget) {
    // -- self: the instance, focusTarget: whatever captureFocus() returned earlier
    if (!focusTarget) return; // -- nothing was focused before, so there's nothing to restore

    var next = null; // -- the element we'll try to refocus
    if (focusTarget.action) next = self.component.querySelector('[data-action="' + focusTarget.action + '"]:not([disabled])'); // -- prefer matching the same arrow/jump action
    else if (focusTarget.page) next = self.component.querySelector('a[data-page="' + focusTarget.page + '"]'); // -- otherwise match the same page number

    if (next) next.focus(); // -- only move focus if a matching element actually exists
  }

  // -- find every instance of this component on the page and bring each one to life
  var components = document.getElementsByClassName(rootClass); // -- a live collection of every ".pagination" element
  var instances = []; // -- collects one Pagination instance per element found

  for (var i = 0; i < components.length; i++) {
    // -- walk the collection from first to last
    instances.push(new Pagination(components[i])); // -- construct and store an instance for this element
  }

  // -- initiate into Rexus object
  $SUPER[objectName] = instances; // -- expose every instance under Rexus.pagination for cross-module access
})();
