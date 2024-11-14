function checkAllAccounts() {
  let emailBody = [];
  emailBody.push('Facebook广告账户检查报告\n');
  emailBody.push(`执行时间: ${new Date().toLocaleString()}\n`);
  emailBody.push('='.repeat(50) + '\n\n');

  for (const account of CONFIG.facebook.adAccounts) {
    try {
      emailBody.push(`开始检查账户: ${account.name} (${account.id})\n`);
      Logger.log(`开始检查账户: ${account.name} (${account.id})`);
      
      const accountResults = checkAccountAds(account);
      emailBody = emailBody.concat(accountResults);
      
      emailBody.push('\n' + '='.repeat(50) + '\n\n');
    } catch (error) {
      const errorMsg = `检查账户 ${account.name} (${account.id}) 时发生错误: ${error.message}`;
      Logger.log(errorMsg);
      emailBody.push(errorMsg + '\n\n');
    }
  }

  // 发送汇总邮件报告
  sendEmailReport(emailBody.join('\n'));
}

function checkAccountAds(account) {
  let accountLogs = [];
  
  try {
    const API_VERSION = 'v21.0';
    const allAdsData = [];
    let url = `https://graph.facebook.com/${API_VERSION}/${account.id}/insights`;
    
    // 构建日期范围
    const today = new Date();
    const startDate = new Date(today.getTime() - (CONFIG.facebook.daysToLookBack * 24 * 60 * 60 * 1000));
    
    // 基础查询参数
    const baseQueryParams = {
      level: 'ad',
      fields: [
        'campaign_id',
        'campaign_name',
        'ad_id',
        'ad_name',
        'spend',
        'website_purchase_roas'
      ].join(','),
      time_range: JSON.stringify({
        'since': formatDate(startDate),
        'until': formatDate(today)
      }),
      limit: 500
    };

    // 获取所有分页数据
    do {
      const queryParams = {...baseQueryParams};
      const fullUrl = url + '?' + Object.entries(queryParams)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      
      const options = {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CONFIG.facebook.accessToken}`
        },
        muteHttpExceptions: true
      };
      
      const response = UrlFetchApp.fetch(fullUrl, options);
      const responseData = JSON.parse(response.getContentText());
      
      if (!responseData.data) {
        throw new Error('API请求失败: ' + JSON.stringify(responseData));
      }
      
      allAdsData.push(...responseData.data);
      url = responseData.paging && responseData.paging.next;
      
      Utilities.sleep(100); // 避免请求过快
    } while (url);
    
    // 处理广告数据
    const adsToCheck = allAdsData.filter(ad => 
      parseFloat(ad.spend) >= CONFIG.facebook.spendThreshold
    );
    
    accountLogs.push(`找到 ${adsToCheck.length} 个花费超过 ${CONFIG.facebook.spendThreshold}美元的广告\n`);
    
    // 获取活跃广告
    const activeAds = getActiveAds(adsToCheck.map(ad => ad.ad_id));
    
    // 输出广告信息
    adsToCheck.forEach(ad => {
      if (!activeAds.includes(ad.ad_id)) return;
      
      const roas = ad.website_purchase_roas && ad.website_purchase_roas.length > 0 
        ? ad.website_purchase_roas[0].value 
        : 0;
      
      const adInfo = [
        `广告ID: ${ad.ad_id}`,
        `Campaign ID: ${ad.campaign_id}`,
        `广告名称: ${ad.ad_name}`,
        `花费: $${parseFloat(ad.spend).toFixed(2)}`,
        `ROAS: ${parseFloat(roas).toFixed(6)}`,
        '------------------------'
      ].join('\n');
      
      accountLogs.push(adInfo + '\n');
    });
    
    // 找出需要暂停的广告
    const adsToPause = adsToCheck.filter(ad => {
      if (!activeAds.includes(ad.ad_id)) return false;
      
      const hasRoasData = ad.website_purchase_roas && 
                         Array.isArray(ad.website_purchase_roas) && 
                         ad.website_purchase_roas.length > 0;
      const roas = hasRoasData ? ad.website_purchase_roas[0].value : 0;
      
      return !hasRoasData || parseFloat(roas) === 0;
    });
    
    // 暂停广告
    if (adsToPause.length > 0) {
      accountLogs.push('\n需要暂停的广告:\n');
      adsToPause.forEach(ad => {
        pauseAd(ad.ad_id);
        const pauseInfo = `已暂停广告 - Name: ${ad.ad_name}, ID: ${ad.ad_id}`;
        accountLogs.push(pauseInfo + '\n');
      });
    }
    
    accountLogs.push(`\n账户总结: 共暂停了 ${adsToPause.length} 个广告。\n`);
    
  } catch (error) {
    accountLogs.push(`处理过程中发生错误: ${error.message}\n`);
  }
  
  return accountLogs;
}

function getActiveAds(adIds) {
  const batchSize = 50;
  const activeAds = [];
  
  for (let i = 0; i < adIds.length; i += batchSize) {
    const batch = adIds.slice(i, i + batchSize);
    const adsUrl = `https://graph.facebook.com/v21.0/?ids=${batch.join(',')}&fields=effective_status`;
    
    const options = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CONFIG.facebook.accessToken}`
      },
      muteHttpExceptions: true
    };
    
    const response = JSON.parse(UrlFetchApp.fetch(adsUrl, options));
    
    Object.entries(response).forEach(([adId, data]) => {
      if (data.effective_status === 'ACTIVE') {
        activeAds.push(adId);
      }
    });
    
    Utilities.sleep(100);
  }
  
  return activeAds;
}

function pauseAd(adId) {
  const url = `https://graph.facebook.com/v21.0/${adId}`;
  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.facebook.accessToken}`
    },
    payload: {
      'status': 'PAUSED'
    },
    muteHttpExceptions: true
  };
  
  return JSON.parse(UrlFetchApp.fetch(url, options).getContentText());
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sendEmailReport(body) {
  try {
    const date = new Date().toLocaleDateString();
    const subject = `${CONFIG.email.subject} - ${date}`;
    
    MailApp.sendEmail({
      to: CONFIG.email.recipient,
      subject: subject,
      body: body
    });
    
    Logger.log('邮件报告已发送至: ' + CONFIG.email.recipient);
  } catch (error) {
    Logger.log('发送邮件时发生错误: ' + error.message);
  }
}  
