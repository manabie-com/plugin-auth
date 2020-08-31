/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as os from 'os';
import { flags, FlagsConfig, SfdxCommand } from '@salesforce/command';
import { AuthFields, AuthInfo, fs, Messages } from '@salesforce/core';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-auth', 'sfdxurl.store');
const commonMessages = Messages.loadMessages('@salesforce/plugin-auth', 'messages');

const AUTH_URL_FORMAT1 = 'force://<refreshToken>@<instanceUrl>';
const AUTH_URL_FORMAT2 = 'force://<clientId>:<clientSecret>:<refreshToken>@<instanceUrl>';

export default class Store extends SfdxCommand {
  public static readonly description = messages.getMessage('description', [AUTH_URL_FORMAT1, AUTH_URL_FORMAT2]);
  public static readonly examples = messages.getMessage('examples').split(os.EOL);
  public static readonly flagsConfig: FlagsConfig = {
    sfdxurlfile: flags.filepath({
      char: 'f',
      description: messages.getMessage('file'),
      required: true,
    }),
    setdefaultdevhubusername: flags.boolean({
      char: 'd',
      description: commonMessages.getMessage('setDefaultDevHub'),
    }),
    setdefaultusername: flags.boolean({
      char: 's',
      description: commonMessages.getMessage('setDefaultUsername'),
    }),
    setalias: flags.string({
      char: 'a',
      description: commonMessages.getMessage('setAlias'),
    }),
  };

  public async run(): Promise<AuthFields> {
    const sfdxAuthUrl = await fs.readFile(this.flags.sfdxurlfile, 'utf8');
    const oauth2Options = AuthInfo.parseSfdxAuthUrl(sfdxAuthUrl);
    const authInfo = await AuthInfo.create({ oauth2Options });
    await authInfo.save();

    let result: AuthFields = {};
    if (this.flags.setalias) {
      await authInfo.setAlias(this.flags.setalias);
    }

    if (this.flags.setdefaultdevhubusername || this.flags.setdefaultusername) {
      await authInfo.setAsDefault({
        defaultUsername: this.flags.setdefaultusername,
        defaultDevhubUsername: this.flags.setdefaultdevhubusername,
      });
    }

    result = authInfo.getFields();
    const successMsg = commonMessages.getMessage('authorizeCommandSuccess', [result.username, result.orgId]);
    this.ux.log(successMsg);
    return result;
  }
}
