import { Element } from '../node_modules/@polymer/polymer/polymer-element.js';
import { scroll } from '../node_modules/@polymer/app-layout/helpers/helpers.js';
import '../node_modules/@polymer/iron-pages/iron-pages.js';
import './news-nav.js';
import './news-snackbar.js';
import { afterNextRender } from '../node_modules/@polymer/polymer/lib/utils/render-status.js';

import { store } from './store/store.js';
import { fetchCategory } from './store/actions/data.js';
import { changeNetworkStatus, navigate } from './store/actions/app.js';

class NewsApp extends Element {
  static get template() {
    return `
    <style>

      :host {
        display: block;
        position: relative;
        min-height: 100vh;
        padding-bottom: 64px;

        --app-border-style: 1px solid #CCC;
        --app-transparent-border-style: 1px solid rgba(255, 255, 255, 0.5);
        --app-button-border-style: 2px solid #222;
        --app-cover-text-color: #FFF;
        --app-nav-background-color: #222;
        --app-nav-text-color: #FFF;
        --app-nav-deselected-text-color: #CCC;
        --app-nav-selected-background-color: #555;

        --app-sub-section-headline: {
          border-top: var(--app-border-style);
          border-bottom: var(--app-border-style);
          font-size: 13px;
          padding: 8px;
          text-align: center;
        };

        /* use this value for the viewport height instead of "vh" unit */
        --viewport-height: 600px;
      }

      iron-pages {
        max-width: 1440px;
        margin: 0 auto;
      }

      footer {
        position: absolute;
        bottom: 0;
        right: 0;
        left: 0;
        padding-bottom: 24px;
        text-align: center;
      }

      footer a {
        text-decoration: none;
        font-size: 13px;
        color: #757575;
      }

      footer a:hover {
        text-decoration: underline;
      }

      /* desktop */
      @media (min-width: 768px) {
        :host {
          margin: 0 40px;
        }
      }

    </style>

    <news-analytics key="UA-39334307-18"></news-analytics>

    <news-nav id="nav" app-title="[[appTitle]]" page="[[page]]" category="[[category]]" load-complete="[[loadComplete]]">
      [[article.headline]]
    </news-nav>

    <iron-pages role="main" selected="[[page]]" attr-for-selected="name" fallback-selection="path-warning">
      <!-- list view of articles in a category -->
      <news-list id="list" name="list" category="[[category]]" offline="[[offline]]"></news-list>
      <!-- article view -->
      <news-article name="article" category="[[category]]" article="[[article]]" offline="[[offline]]"></news-article>
      <!-- invalid top level paths -->
      <news-path-warning name="path-warning"></news-path-warning>

    </iron-pages>

    <footer>
      <a href="https://www.polymer-project.org/1.0/toolbox/">Made by Polymer</a>
    </footer>
`;
  }

  static get is() { return 'news-app'; }

  static get properties() { return {

    appTitle: String,

    route: {
      type: String,
      observer: '_routeChanged'
    },

    page: {
      type: String,
      observer: '_pageChanged'
    },

    categories: Object,

    categoryName: {
      type: String
    },
    category: Object,

    articleName: String,
    article: {
      type: Object,
      computed: '_computeArticle(category.items, articleName)'
    },

    offline: {
      type: Boolean,
      observer: '_offlineChanged'
    },
    loadComplete: Boolean
  }}

  static get observers() { return [
    '_updateDocumentTitle(page, category.title, article.headline, appTitle)',
  ]}

  constructor() {
    super();
    store.subscribe(() => this.update());
    this.update();
  }

  update() {
    const state = store.getState();
    this.setProperties({
      offline: !state.app.online,
      route: state.path.route,
      page: state.path.page,
      categoryName: state.path.category,
      articleName: state.path.article,
      categories: state.data,
      category: this._getCategoryData(state),
      // article is a computed property
    });
  }

  ready() {
    super.ready();
    // Custom elements polyfill safe way to indicate an element has been upgraded.
    this.removeAttribute('unresolved');

    // Chrome on iOS recomputes "vh" unit when URL bar goes off screen. Since we use "vh" unit
    // to size the cover image and the title, those items will resize in response to the URL
    // bar being shown or hidden. FWIW, this is not an issue in Chrome 56 on Android or iOS
    // Safari. To workaround this on Chrome on iOS, we will use a
    // fixed viewport height in places where normally relying on "vh" unit and replace them with
    // custom property "--viewport-height".
    let ua = navigator.userAgent;
    let cMatch = navigator.userAgent.match(/Android.*Chrome[\/\s](\d+\.\d+)/);
    if (ua.match('CriOS') || (cMatch && cMatch[0] && cMatch[1] < 56)) {
      document.body.classList.add('fixed-viewport-height');
    }

    afterNextRender(this, () => {
      window.addEventListener('online', (e) => this._notifyNetworkStatus());
      window.addEventListener('offline', (e) => this._notifyNetworkStatus());
      this.addEventListener('refresh-data', (e) => this._refreshData(e));
    });

    this.setupRouteListeners();
  }

  connectedCallback() {
    super.connectedCallback();
    this.isAttached = true;
  }

  setupRouteListeners() {
    document.body.addEventListener('click', e => {
      if ((e.button !== 0) ||           // Left click only
          (e.metaKey || e.ctrlKey)) {   // No modifiers
        return;
      }

      let origin = window.location.origin ?
          window.location.origin :
          window.location.protocol + '//' + window.location.host

      let anchor = e.composedPath().filter(n => n.localName == 'a')[0];
      if (anchor && anchor.href.indexOf(origin) === 0) {
        e.preventDefault();
        window.history.pushState({}, '', anchor.href);
        this._notify();
      }
    });

    window.addEventListener('popstate', this._notifyPathChanged);
    this._notifyPathChanged();
  }

  _getCategoryData(state) {
    return state.data[state.path.category];
  }

  _computeArticle(items, articleName) {
    if (!items) {
      return undefined;
    }
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === articleName) {
        return items[i];
      }
    }
    return undefined;
  }

  _routeChanged(route) {
    if (!this.isAttached) {
      return;
    }
    // Scroll to the top of the page on every *route* change. Use `Polymer.AppLayout.scroll`
    // with `behavior: 'silent'` to disable header scroll effects during the scroll.
    //scroll({ top: 0, behavior: 'silent' });
    // Close the drawer - in case the *route* change came from a link in the drawer.
    this.$.nav.closeDrawer();
  }

  _pageChanged(page, oldPage) {
    let href;

    switch(page) {
      case 'list':
        href = 'news-list.js';
      break;
      case 'article':
        href = 'news-article.js';
      break;
      default:
        href = 'news-path-warning.js';
      break;
    }
    let cb = this._pageLoaded.bind(this, Boolean(oldPage));
    import('./' + href).then(cb);
  }

  _pageLoaded(shouldResetLayout) {
    this._ensureLazyLoaded();
  }

  _ensureLazyLoaded() {
    // load lazy resources after render and set `loadComplete` when done.
    if (!this.loadComplete) {
      afterNextRender(this, () => {
        import('./lazy-resources.js').then( () => {
          this._notifyNetworkStatus();
          this.loadComplete = true;

          // Load pre-caching Service Worker
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('service-worker.js', {scope: '/'});
          }
        });
      });
    }
  }

  _notifyNetworkStatus() {
    store.dispatch(changeNetworkStatus(window.navigator.onLine));
  }

  _notifyPathChanged() {
    store.dispatch(navigate(window.decodeURIComponent(window.location.pathname)));
  }

  _offlineChanged(offline, oldOffline) {
    // Show the snackbar if the user is offline when starting a new session
    // or if the network status changed.
    if (offline || (!offline && oldOffline === true)) {
      if (!this._networkSnackbar) {
        this._networkSnackbar = document.createElement('news-snackbar');
        this.root.appendChild(this._networkSnackbar);
      }
      this._networkSnackbar.textContent = offline ?
          'You are offline' : 'You are online';
      this._networkSnackbar.open();
    }
  }

  // Elements in the app can notify section changes.
  // Response by a11y announcing the section and syncronizing the category.
  _updateDocumentTitle(page, categoryTitle, articleHeadline, appTitle) {
    document.title = (page === 'list' ? categoryTitle : articleHeadline) + ' - ' + appTitle;
  }

  _refreshData() {
    store.dispatch(fetchCategory(3));
  }
}

customElements.define(NewsApp.is, NewsApp);
