/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import fs from 'node:fs';
// import open, { apps, AppName } from 'open';
import { Flags, SfCommand, loglevel } from '@salesforce/sf-plugins-core';
import { AuthFields, AuthInfo, Logger, Messages, OAuth2Config, SfError, WebOAuthServer } from '@salesforce/core';
import { Env } from '@salesforce/kit';
import common from '../../../common.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-auth', 'web.login');
const commonMessages = Messages.loadMessages('@salesforce/plugin-auth', 'messages');

export default class LoginWeb extends SfCommand<AuthFields> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly deprecateAliases = true;
  public static readonly aliases = ['force:auth:web:login', 'auth:web:login'];

  public static readonly flags = {
    browser: Flags.option({
      char: 'b',
      summary: messages.getMessage('flags.browser.summary'),
      description: messages.getMessage('flags.browser.description'),
      options: ['chrome', 'edge', 'firefox'], // These are ones supported by "open" package
    })(),
    'client-id': Flags.string({
      char: 'i',
      summary: commonMessages.getMessage('flags.client-id.summary'),
      deprecateAliases: true,
      aliases: ['clientid'],
    }),
    'instance-url': Flags.url({
      char: 'r',
      summary: commonMessages.getMessage('flags.instance-url.summary'),
      description: commonMessages.getMessage('flags.instance-url.description'),
      deprecateAliases: true,
      aliases: ['instanceurl', 'l'],
    }),
    'set-default-dev-hub': Flags.boolean({
      char: 'd',
      summary: commonMessages.getMessage('flags.set-default-dev-hub.summary'),
      deprecateAliases: true,
      aliases: ['setdefaultdevhubusername', 'setdefaultdevhub', 'v'],
    }),
    'set-default': Flags.boolean({
      char: 's',
      summary: commonMessages.getMessage('flags.set-default.summary'),
      deprecateAliases: true,
      aliases: ['setdefaultusername'],
    }),
    alias: Flags.string({
      char: 'a',
      summary: commonMessages.getMessage('flags.alias.summary'),
      deprecateAliases: true,
      aliases: ['setalias'],
    }),
    'no-prompt': Flags.boolean({
      char: 'p',
      summary: commonMessages.getMessage('flags.no-prompt.summary'),
      required: false,
      hidden: true,
      deprecateAliases: true,
      aliases: ['noprompt'],
    }),
    loglevel,
  };

  private logger = Logger.childFromRoot(this.constructor.name);

  public async run(): Promise<AuthFields> {
    const { flags } = await this.parse(LoginWeb);
    if (isContainerMode()) {
      throw new SfError(messages.getMessage('deviceWarning'), 'DEVICE_WARNING');
    }

    if (await common.shouldExitCommand(flags['no-prompt'])) return {};

    const oauthConfig: OAuth2Config = {
      loginUrl: await common.resolveLoginUrl(flags['instance-url']?.href),
      clientId: flags['client-id'],
      ...(flags['client-id']
        ? { clientSecret: await this.secretPrompt({ message: commonMessages.getMessage('clientSecretStdin') }) }
        : {}),
    };

    try {
      const authInfo = await this.executeLoginFlow(oauthConfig);
      await authInfo.handleAliasAndDefaultSettings({
        alias: flags.alias,
        setDefault: flags['set-default'],
        setDefaultDevHub: flags['set-default-dev-hub'],
      });
      const fields = authInfo.getFields(true);
      await AuthInfo.identifyPossibleScratchOrgs(fields, authInfo);

      const successMsg = commonMessages.getMessage('authorizeCommandSuccess', [fields.username, fields.orgId]);
      this.logSuccess(successMsg);
      return fields;
    } catch (err) {
      Logger.childFromRoot('LoginWebCommand').debug(err);
      if (err instanceof SfError && err.name === 'AuthCodeExchangeError') {
        err.message = messages.getMessage('invalidClientId', [err.message]);
      }
      throw err;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  // private async sleep(ms: number): Promise<void> {
  //   return new Promise((resolve) => setTimeout(resolve, ms));
  // }

  // leave it because it's stubbed in the test
  // eslint-disable-next-line class-methods-use-this
  private async executeLoginFlow(oauthConfig: OAuth2Config): Promise<AuthInfo> {
    const oauthServer = await WebOAuthServer.create({ oauthConfig });
    await oauthServer.start();
    // const app = browser && browser in apps ? (browser as AppName) : undefined;
    // const openOptions = app ? { app: { name: apps[app] }, wait: false } : { wait: false };
    const authorizationUrl = oauthServer.getAuthorizationUrl();
    fs.writeFileSync('authUrl.txt', authorizationUrl);
    this.logger.debug(`Opening browser ${authorizationUrl}`);

    // await this.sleep(30000);
    // await open(oauthServer.getAuthorizationUrl(), openOptions);
    // const app = browser && browser in apps ? (browser as AppName) : undefined;
    // const openOptions = app ? { app: { name: apps[app] }, wait: false } : { wait: false };
    // this.logger.debug(`Opening browser ${app ?? ''}`);
    // the following `childProcess` wrapper is needed to catch when `open` fails to open a browser.
    // await open(oauthServer.getAuthorizationUrl(), openOptions).then(
    //   (childProcess) =>
    //     new Promise((resolve, reject) => {
    //       // https://nodejs.org/api/child_process.html#event-exit
    //       childProcess.on('exit', (code) => {
    //         if (code && code > 0) {
    //           this.logger.debug(`Failed to open browser ${app ?? ''}`);
    //           reject(messages.createError('error.cannotOpenBrowser', [app], [app]));
    //         }
    //         // If the process exited, code is the final exit code of the process, otherwise null.
    //         // resolve on null just to be safe, worst case the browser didn't open and the CLI just hangs.
    //         if (code === null || code === 0) {
    //           this.logger.debug(`Successfully opened browser ${app ?? ''}`);
    //           resolve(childProcess);
    //         }
    //       });
    //     })
    // );
    return oauthServer.authorizeAndSave();
  }
}

const isContainerMode = (): boolean => {
  const env = new Env();
  return env.getBoolean('SF_CONTAINER_MODE', env.getBoolean('SFDX_CONTAINER_MODE'));
};
