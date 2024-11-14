const CONFIG = {
  facebook: {
    appId: 'YOUR_APP_ID',
    appSecret: 'YOUR_APP_SECRET',
    shortLivedToken: 'YOUR_SHORT_LIVED_TOKEN',
    adAccounts: [
      {
        id: 'act_XXXXXXXXXXXX',
        name: '账户1'
      },
      {
        id: 'act_YYYYYYYYYYYY',
        name: '账户2'
      }
    ],
    spendThreshold: 1000,
    daysToLookBack: 7
  },
  email: {
    recipient: 'hengyan.han@funplus.com',
    subject: 'Facebook Ads Performance Report'
  }
}; 
