/** Exercise real settings controls with a simulated authority; preserve the live vault login. */
export function runOAuthUiIntegration({ evaluate }) {
	return evaluate(`
		const plugin = app.plugins.plugins['confluence-integration'];
		if (plugin.browserOAuth.pending) throw Error('Finish the active login before testing OAuth UI');
		const original = { settings: plugin.settings, oauth: plugin.browserOAuth, save: plugin.saveSettings };
		const secrets = new Map();
		const storage = {getSecret:id=>secrets.get(id)||null,setSecret:(id,value)=>secrets.set(id,value),listSecrets:()=>[...secrets.keys()]};
		let decision = 'pending';
		let opened = 0;
		const response = (data,status=200)=>({ok:status===200,status,statusText:'',json:async()=>data,text:async()=>JSON.stringify(data)});
		const fetch = async (url) => {
			if(url.endsWith('/oauth/device/code')) return response({device_code:'simulated-device-credential',user_code:'TEST-CODE',verification_uri:'https://auth.atlassian.com/activate',interval:1,expires_in:60});
			if(url.endsWith('/accessible-resources')) return response([{id:'c3c16874-09be-4bda-9016-2fbd2e925d90',url:'https://markdown-confluence.atlassian.net',name:'Simulated authority',scopes:['read:page:confluence']}]);
			return decision==='approve' ? response({access_token:'simulated-access',refresh_token:'simulated-refresh',token_type:'Bearer',expires_in:3600}) : response({error:'authorization_pending'},400);
		};
		const until = async (condition) => { for(let attempt=0;attempt<150;attempt++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('OAuth UI did not reach the expected state'); };
		const click = (name) => { const button=[...app.setting.activeTab.containerEl.querySelectorAll('button')].find(button=>button.textContent===name);if(!button||button.disabled)throw Error('OAuth UI button unavailable: '+name);button.click(); };
		try {
			plugin.settings={...original.settings,confluenceAuthType:'oauth2',oauthMode:'browser',oauthFlow:'device',oauthClientId:'simulated-client',oauthClientSecretId:'',oauthSecretId:'',oauthSites:[],oauthSiteId:''};
			plugin.saveSettings=async()=>{};
			plugin.browserOAuth=new original.oauth.constructor(()=>plugin.settings,()=>storage,()=>plugin.saveSettings(),()=>{opened++},{fetch,sleep:async(_duration,signal)=>{if(signal.aborted)throw Error('cancelled');await new Promise(resolve=>setTimeout(resolve,20));}});
			app.setting.open();app.setting.openTabById('confluence-integration');app.setting.activeTab.display();
			click('Connect to Atlassian');
			await until(()=>!!plugin.browserOAuth.deviceAuthorization);
			if(!app.setting.activeTab.containerEl.innerText.includes('TEST-CODE'))throw Error('Device code was not visible');
			if(!app.setting.activeTab.containerEl.querySelector('input[type=password]'))throw Error('Secret input was not masked');
			click('Open browser');if(opened!==2)throw Error('Open browser did not reopen verification');
			click('Cancel login');await until(()=>!plugin.browserOAuth.pending);
			if(plugin.browserOAuth.connected||[...secrets.values()].some(Boolean))throw Error('Cancelled device login retained credentials');
			click('Connect to Atlassian');await until(()=>!!plugin.browserOAuth.deviceAuthorization);
			decision='approve';await until(()=>plugin.browserOAuth.connected&&!plugin.browserOAuth.pending);
			if(plugin.settings.oauthSiteId!=='c3c16874-09be-4bda-9016-2fbd2e925d90')throw Error('Authorized site was not selected');
			if(JSON.stringify(plugin.settings).includes('simulated-refresh'))throw Error('Simulated credentials leaked into settings');
			click('Disconnect');await until(()=>!plugin.browserOAuth.connected);
			if(plugin.settings.oauthSites.length||[...secrets.values()].some(Boolean))throw Error('Disconnect retained device credentials');
			return JSON.stringify({status:'passed',authority:'simulated',checks:['visible-device-code','masked-secret','reopen-browser','cancel','retry','approve','site-selection','secret-storage','disconnect']});
		} finally {
			plugin.browserOAuth.cancel();
			plugin.settings=original.settings;plugin.browserOAuth=original.oauth;plugin.saveSettings=original.save;
			app.setting.activeTab.display();
		}
	`);
}

/** Probe the real device grant without disconnecting or altering the saved browser session. */
export function runDeviceAvailabilityIntegration({ evaluate }) {
	return evaluate(`
		const plugin=app.plugins.plugins['confluence-integration'];
		if(plugin.browserOAuth.pending)throw Error('Finish the current login first');
		const original={settings:plugin.settings,oauth:plugin.browserOAuth,save:plugin.saveSettings};
		const wasConnected=original.oauth.connected;
		const memory=new Map();
		const secret=original.settings.oauthClientSecretId && app.secretStorage.getSecret(original.settings.oauthClientSecretId);
		if(secret)memory.set(original.settings.oauthClientSecretId,secret);
		const storage={getSecret:id=>memory.get(id)||null,setSecret:(id,value)=>memory.set(id,value),listSecrets:()=>[...memory.keys()]};
		let result;
		try {
			plugin.settings={...original.settings,oauthFlow:'device',oauthSecretId:'',oauthSites:[],oauthSiteId:''};
			plugin.saveSettings=async()=>{};
			plugin.browserOAuth=new original.oauth.constructor(()=>plugin.settings,()=>storage,async()=>{},()=>{});
			app.setting.open();app.setting.openTabById('confluence-integration');app.setting.activeTab.display();
			const button=[...app.setting.activeTab.containerEl.querySelectorAll('button')].find(button=>button.textContent==='Connect to Atlassian');
			if(!button)throw Error('Connect control missing');button.click();
			for(let attempt=0;attempt<1500&&plugin.browserOAuth.pending&&!plugin.browserOAuth.deviceAuthorization;attempt++)await new Promise(resolve=>setTimeout(resolve,20));
			result={authority:'Atlassian',deviceGrantAvailable:!!plugin.browserOAuth.deviceAuthorization,message:plugin.browserOAuth.status};
			if(!result.deviceGrantAvailable&&!result.message.includes('Device-code login is not enabled'))throw Error('Unexpected device-grant result: '+result.message);
		} finally {
			plugin.browserOAuth.cancel();
			for(let attempt=0;attempt<100&&plugin.browserOAuth.pending;attempt++)await new Promise(resolve=>setTimeout(resolve,20));
			plugin.settings=original.settings;plugin.browserOAuth=original.oauth;plugin.saveSettings=original.save;
			memory.clear();app.setting.activeTab.display();
		}
		if(plugin.browserOAuth.connected!==wasConnected)throw Error('The existing login changed during the isolated probe');
		return JSON.stringify({...result,existingSessionPreserved:true});
	`);
}
