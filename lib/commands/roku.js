import log from '../logger';
import axios from 'axios';
import B from 'bluebird';
import _ from 'lodash';
import { errors } from 'appium/driver';
import xml2js from 'xml2js';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import xpath from 'xpath';

/**
 * @this RokuDriver
 * @returns {Promise<any>}
 */
export async function execute (script, args) {
  if (script.match(/^roku:/)) {
    log.info(`Executing Roku command '${script}'`);
    script = script.replace(/^roku:/, '').trim();
    return await this.executeRoku(script, _.isArray(args) ? args[0] : args);
  }

  throw new errors.NotImplementedError();
}

/**
 * @this RokuDriver
 * @param {string} urlStr
 * @param {import('@appium/types').HTTPMethod} [method]
 * @param {string} [body]
 * @returns {Promise<any>}
 */
export async function rokuEcp (urlStr, method = 'POST', body = '') {
  const {rokuHost, rokuEcpPort, rokuUser, rokuPass, rokuHeaderHost} = this.opts;
  const url = `http://${rokuHost}:${rokuEcpPort}${urlStr}`;
  log.info(`Running ECP command: ${url}`);
  return await axios({
    method,
    url,
    headers: {HOST: rokuHeaderHost},
    auth: {username: rokuUser, password: rokuPass},
    data: body,
    responseType: 'text'
  });
}

/**
 * @this RokuDriver
 * @template [TOpts={}]
 * @param {string} rokuCommand
 * @param {TOpts} [opts]
 * @returns {Promise<any>}
 */
export async function executeRoku (rokuCommand, opts = /** @type {TOpts} */({})) {
  const rokuCommands = [
    'deviceInfo',
    'pressKey',
    'getApps',
    'activeApp',
    'appUI',
    'activateApp',
    'installApp',
    'removeApp',
  ];

  if (!_.includes(rokuCommands, rokuCommand)) {
    throw new errors.UnknownCommandError(`Unknown roku command "${rokuCommand}". ` +
      `Only ${rokuCommands} commands are supported.`);
  }
  return await this[`roku_${rokuCommand}`](opts);
}

/**
 * @this RokuDriver
 * @param {{key: string}} opts
 */
export async function roku_pressKey ({key}) {
  await this.rokuEcp(`/keypress/${key}`);
  if (this.opts.keyCooldown) {
    await B.delay(this.opts.keyCooldown);
  }
  this._cachedSourceDirty = true;
}

/**
 * @this RokuDriver
 * @returns {Promise<any>}
 */
export async function roku_deviceInfo () {
  const deviceXml = (await this.rokuEcp('/query/device-info', 'GET')).data;
  const parser = new xml2js.Parser();
  const info = (await parser.parseStringPromise(deviceXml))['device-info'];
  const niceInfo = {};
  for (const key of Object.keys(info)) {
    niceInfo[key] = info[key][0];
  }
  return niceInfo;
}

/**
 * @this RokuDriver
 * @returns {Promise<RokuAppData[]>}
 */
export async function roku_getApps () {
  const appXml = (await this.rokuEcp('/query/apps', 'GET')).data;
  const parser = new xml2js.Parser();
  return (await parser.parseStringPromise(appXml)).apps.app.map((a) => {
    const {id, subtype, type, version} = a.$;
    return {id, subtype, type, version, name: a._};
  });
}

/**
 * @this RokuDriver
 * @returns {Promise<RokuAppData>}
 */
export async function roku_activeApp () {
  const appXml = (await this.rokuEcp('/query/active-app', 'GET')).data;
  const parser = new xml2js.Parser();
  return (await parser.parseStringPromise(appXml))['active-app'].app.map((a) => {
    if (_.isString(a)) {
      return {name: a};
    }
    const {id, subtype, type, version} = a.$;
    return {id, subtype, type, version, name: a._};
  })[0];
}

/**
 * @this RokuDriver
 * @param {boolean} [stripOuterTags]
 * @returns {Promise<import('xml2js').convertableToString>}
 */
export async function roku_appUI (stripOuterTags = false) {
  const xml = (await this.rokuEcp('/query/app-ui', 'GET')).data;
  const parser = new xml2js.Parser();
  const parsed = await parser.parseStringPromise(xml);
  if (parsed['app-ui'].status[0] === 'FAILED') {
    const errMsg = parsed['app-ui'].error[0];
    throw new Error(`Could not retrieve app UI. Error was: ${errMsg}`);
  }

  if (stripOuterTags) {
    const doc = new DOMParser().parseFromString(xml);
    const nodes = xpath.select('//topscreen', doc);
    const serializer = new XMLSerializer();
    return serializer.serializeToString(/** @type {Node} */(nodes[0]));
  }
  return xml;
}

/**
 * @this RokuDriver
 * @param {ActivateAppOptions & {appId: string}} opts
 */
export async function roku_activateApp ({appId, contentId, mediaType}) {
  return await this.activateApp(appId, {contentId, mediaType});
}

/**
 * @this RokuDriver
 * @param {{appPath: string}} opts
 */
export async function roku_installApp ({appPath}) {
  return await this.installApp(appPath);
}

/**
 * @this RokuDriver
 */
export async function roku_removeApp () {
  return await this.removeApp();
}


/**
 * @typedef {import('../driver').RokuDriver} RokuDriver
 */

/**
 * @typedef ActivateAppOptions
 * @property {string} [contentId]
 * @property {string} [mediaType]
 */

/**
 * @typedef RokuAppData
 * @property {string} id
 * @property {string} subtype
 * @property {string} type
 * @property {string} version
 * @property {string} name
 */
