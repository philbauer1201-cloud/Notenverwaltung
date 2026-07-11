import { getDB } from './db.js';

export let appData = {
  mode: 'dev', // 'dev' or 'live'
  route: 'dashboard',
  routeParams: {},
  db: null // Holds the database state
};

export function initState() {
  appData.db = getDB();
}

export function setMode(newMode) {
  appData.mode = newMode;
  // Here we would normally trigger renderUI()
}

export function setRoute(route, params = {}) {
  appData.route = route;
  appData.routeParams = params;
}
