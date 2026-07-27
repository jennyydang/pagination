/**
 * Pagination
 *
 * WCAG 2.2 AA pagination component. Works from server-rendered markup
 * (real `<a href>` page links, degrades fully without JS) and can be
 * driven as an AJAX/SPA control by listening for the `pagination:navigate`
 * event and calling `update()` once new content has loaded.
 *
 * Markup contract (see index.html for a full example):
 *   <nav data-pagination
 *        data-current-page="4"
 *        data-total-pages="50"
 *        data-url-pattern="/products?page={page}">
 *     <noscript>...real links, same page range, for no-JS fallback...</noscript>
 *   </nav>
 *
 * Public API:
 *   const pagination = new Pagination(rootEl, options?);
 *   pagination.update({ currentPage, totalPages, urlPattern? });
 *   pagination.destroy();
 *
 * Events (dispatched on the root element, bubbles + cancelable):
 *   'pagination:navigate' detail: { page, url, previousPage, totalPages }
 *     Call event.preventDefault() to take over navigation yourself (AJAX).
 *     If left un-prevented, Pagination performs a normal navigation
 *     (window.location.assign(url)).
 */

const SIBLING_COUNT = 2;
const JUMP_SIZE = 5;

let instanceCount = 0;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Computes the list of items to render between the first and last page.
 * Matches the fixed set of layouts required by the design:
 *   1 2 3 4 5            (no ellipsis needed, everything fits)
 *   [1] 2 3 4 5 … 50
 *   1 [2] 3 4 5 … 50
 *   1 2 [3] 4 5 … 50
 *   1 2 3 [4] 5 6 … 50    (page 1 merges into the run, gap is 1)
 *   1 … 45 46 [47] 48 49 50
 */
function getPageRange(current, total, siblingCount = SIBLING_COUNT) {
  if (total <= 0) return [];

  let start = current - siblingCount;
  let end = current + siblingCount;

  if (start < 1) {
    end += 1 - start;
    start = 1;
  }
  if (end > total) {
    start -= end - total;
    end = total;
  }
  start = Math.max(start, 1);
  end = Math.min(end, total);

  const showLeftEllipsis = start > 2;
  const showRightEllipsis = end < total - 1;

  if (!showLeftEllipsis) start = 1;
  if (!showRightEllipsis) end = total;

  const items = [];

  if (showLeftEllipsis) {
    items.push({ type: 'page', page: 1 });
    items.push({ type: 'ellipsis', direction: 'prev' });
  }

  for (let page = start; page <= end; page += 1) {
    items.push({ type: 'page', page });
  }

  if (showRightEllipsis) {
    items.push({ type: 'ellipsis', direction: 'next' });
    items.push({ type: 'page', page: total });
  }

  return items;
}

export default class Pagination {
  constructor(root, options = {}) {
    if (!root) throw new Error('Pagination: root element is required');

    this.root = root;
    this.currentPage = clamp(
      options.currentPage ?? (parseInt(root.dataset.currentPage, 10) || 1),
      1,
      Infinity
    );
    this.totalPages = Math.max(
      options.totalPages ?? (parseInt(root.dataset.totalPages, 10) || 1),
      1
    );
    this.currentPage = clamp(this.currentPage, 1, this.totalPages);
    this.urlPattern = options.urlPattern ?? root.dataset.urlPattern ?? '?page={page}';
    this.siblingCount = options.siblingCount ?? SIBLING_COUNT;
    this.jumpSize = options.jumpSize ?? JUMP_SIZE;

    instanceCount += 1;
    this.id = root.id || `pagination-${instanceCount}`;
    root.id = this.id;

    this._onClick = this._onClick.bind(this);
    this._onSubmit = this._onSubmit.bind(this);

    this._render();
    this.root.addEventListener('click', this._onClick);
    this.root.addEventListener('submit', this._onSubmit);
  }

  /** Builds the target URL for a given page from the configured pattern. */
  buildUrl(page) {
    return this.urlPattern.replace('{page}', String(page));
  }

  /**
   * Re-renders the component for a new state. Call this after an AJAX
   * navigation has resolved (i.e. after you've swapped in the new content).
   */
  update({ currentPage, totalPages, urlPattern } = {}) {
    if (totalPages !== undefined) this.totalPages = Math.max(totalPages, 1);
    if (currentPage !== undefined) {
      this.currentPage = clamp(currentPage, 1, this.totalPages);
    }
    if (urlPattern !== undefined) this.urlPattern = urlPattern;
    this._render();
    this._announce(`Page ${this.currentPage} of ${this.totalPages}`);
  }

  /** Removes listeners and empties the root. Leaves the root element itself in the DOM. */
  destroy() {
    this.root.removeEventListener('click', this._onClick);
    this.root.removeEventListener('submit', this._onSubmit);
    this.root.innerHTML = '';
  }

  _render() {
    const focusTarget = this._captureFocus();

    this.root.innerHTML = '';
    if (!this.root.hasAttribute('aria-label')) {
      this.root.setAttribute('aria-label', 'Pagination');
    }

    this.liveRegion = document.createElement('div');
    this.liveRegion.className = 'pagination__status u-visually-hidden';
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');

    this.root.append(this.liveRegion, this._renderDesktop(), this._renderMobile());

    this._restoreFocus(focusTarget);
  }

  // Desktop: < [1] 2 3 4 5 … 50 >
  _renderDesktop() {
    const nav = document.createElement('div');
    nav.className = 'pagination__desktop';

    const list = document.createElement('ul');
    list.className = 'pagination__list';

    list.append(
      this._buildArrowItem('prev', 'Previous page', '‹', this.currentPage <= 1),
      ...getPageRange(this.currentPage, this.totalPages, this.siblingCount).map((item) =>
        item.type === 'page' ? this._buildPageItem(item.page) : this._buildEllipsisItem(item.direction)
      ),
      this._buildArrowItem('next', 'Next page', '›', this.currentPage >= this.totalPages)
    );

    nav.append(list);
    return nav;
  }

  _buildArrowItem(action, label, glyph, disabled) {
    const li = document.createElement('li');
    li.className = 'pagination__item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `pagination__arrow pagination__arrow--${action}`;
    button.setAttribute('aria-label', label);
    button.dataset.action = action;
    if (disabled) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
    }

    const icon = document.createElement('span');
    icon.className = 'pagination__arrow-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = glyph;
    button.append(icon);

    li.append(button);
    return li;
  }

  _buildPageItem(page) {
    const isCurrent = page === this.currentPage;
    const li = document.createElement('li');
    li.className = 'pagination__item';

    const link = document.createElement('a');
    link.className = 'pagination__link';
    link.href = this.buildUrl(page);
    link.textContent = String(page);
    link.dataset.page = String(page);

    if (isCurrent) {
      link.classList.add('pagination__link--current');
      link.setAttribute('aria-current', 'page');
      link.setAttribute('aria-label', `Page ${page}, current page`);
    } else {
      link.setAttribute('aria-label', `Page ${page}`);
    }

    li.append(link);
    return li;
  }

  _buildEllipsisItem(direction) {
    const target =
      direction === 'prev'
        ? clamp(this.currentPage - this.jumpSize, 1, this.totalPages)
        : clamp(this.currentPage + this.jumpSize, 1, this.totalPages);

    const li = document.createElement('li');
    li.className = 'pagination__item pagination__item--ellipsis';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pagination__ellipsis';
    button.dataset.action = direction === 'prev' ? 'jump-prev' : 'jump-next';
    button.dataset.page = String(target);
    button.setAttribute(
      'aria-label',
      direction === 'prev'
        ? `Jump back ${this.jumpSize} pages to page ${target}`
        : `Jump forward ${this.jumpSize} pages to page ${target}`
    );

    const dots = document.createElement('span');
    dots.className = 'pagination__ellipsis-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.textContent = '…';

    const arrow = document.createElement('span');
    arrow.className = 'pagination__ellipsis-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = direction === 'prev' ? '«' : '»';

    button.append(dots, arrow);
    li.append(button);
    return li;
  }

  // Mobile: < 1 / 50 >  (left number is an editable input, Enter navigates)
  _renderMobile() {
    const wrap = document.createElement('div');
    wrap.className = 'pagination__mobile';

    const prev = this._buildArrowItem('prev', 'Previous page', '‹', this.currentPage <= 1).firstElementChild;
    const next = this._buildArrowItem('next', 'Next page', '›', this.currentPage >= this.totalPages).firstElementChild;

    const form = document.createElement('form');
    form.className = 'pagination__goto';
    form.dataset.gotoForm = '';
    form.setAttribute('role', 'group');
    form.setAttribute('aria-label', 'Go to page');
    form.noValidate = true;

    const labelId = `${this.id}-goto-label`;
    const inputId = `${this.id}-goto-input`;
    const errorId = `${this.id}-goto-error`;

    const label = document.createElement('label');
    label.className = 'u-visually-hidden';
    label.id = labelId;
    label.htmlFor = inputId;
    label.textContent = `Page number, currently page ${this.currentPage} of ${this.totalPages}`;

    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.pattern = '[0-9]*';
    input.className = 'pagination__input';
    input.id = inputId;
    input.min = '1';
    input.max = String(this.totalPages);
    input.value = String(this.currentPage);
    input.autocomplete = 'off';
    input.setAttribute('aria-describedby', errorId);
    input.dataset.pageInput = '';

    const total = document.createElement('span');
    total.className = 'pagination__total';
    total.setAttribute('aria-hidden', 'true');
    total.textContent = `/ ${this.totalPages}`;

    const error = document.createElement('span');
    error.className = 'pagination__error u-visually-hidden';
    error.id = errorId;
    error.setAttribute('aria-live', 'polite');
    this._errorEl = error;

    form.append(label, input, total, error);
    wrap.append(prev, form, next);
    return wrap;
  }

  _onClick(event) {
    const arrowButton = event.target.closest('[data-action="prev"], [data-action="next"]');
    const jumpButton = event.target.closest('[data-action="jump-prev"], [data-action="jump-next"]');
    const pageLink = event.target.closest('a[data-page]');

    if (arrowButton) {
      event.preventDefault();
      const delta = arrowButton.dataset.action === 'prev' ? -1 : 1;
      this._navigate(clamp(this.currentPage + delta, 1, this.totalPages));
      return;
    }

    if (jumpButton) {
      event.preventDefault();
      this._navigate(parseInt(jumpButton.dataset.page, 10));
      return;
    }

    if (pageLink) {
      const page = parseInt(pageLink.dataset.page, 10);
      if (page === this.currentPage) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      this._navigate(page);
    }
  }

  _onSubmit(event) {
    if (!event.target.closest('[data-goto-form]')) return;
    event.preventDefault();

    const input = event.target.querySelector('[data-page-input]');
    const raw = input.value.trim();
    const page = Number(raw);

    if (!raw || !Number.isInteger(page) || page < 1 || page > this.totalPages) {
      this._setInputError(`Enter a page number between 1 and ${this.totalPages}.`);
      input.focus();
      input.select();
      return;
    }

    this._setInputError('');
    if (page === this.currentPage) return;
    this._navigate(page);
  }

  _setInputError(message) {
    if (this._errorEl) this._errorEl.textContent = message;
  }

  _navigate(page) {
    page = clamp(page, 1, this.totalPages);
    const previousPage = this.currentPage;
    const url = this.buildUrl(page);

    const navigateEvent = new CustomEvent('pagination:navigate', {
      bubbles: true,
      cancelable: true,
      detail: { page, previousPage, totalPages: this.totalPages, url },
    });

    const proceedWithDefault = this.root.dispatchEvent(navigateEvent);

    if (proceedWithDefault) {
      window.location.assign(url);
    }
    // If defaultPrevented, the host application is responsible for fetching
    // new content and calling `pagination.update({ currentPage: page })`.
  }

  _announce(message) {
    if (this.liveRegion) this.liveRegion.textContent = message;
  }

  _captureFocus() {
    const active = this.root.contains(document.activeElement) ? document.activeElement : null;
    if (!active) return null;
    return { action: active.dataset.action || null, page: active.dataset.page || null };
  }

  _restoreFocus(focusTarget) {
    if (!focusTarget) return;
    const { action, page } = focusTarget;
    let next = null;
    if (action) {
      next = this.root.querySelector(`[data-action="${action}"]:not([disabled])`);
    } else if (page) {
      next = this.root.querySelector(`a[data-page="${page}"]`);
    }
    if (next) next.focus();
  }
}

Pagination.getPageRange = getPageRange;

/** Auto-initializes every `[data-pagination]` element found in `root`. */
export function initAll(root = document) {
  return Array.from(root.querySelectorAll('[data-pagination]')).map((el) => new Pagination(el));
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAll());
  } else {
    initAll();
  }
}
