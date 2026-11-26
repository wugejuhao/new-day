/**
 * @fileoverview 狂野飙车 9 (Asphalt 9) 激励广告 0.5 秒全自动领奖 + 自动关闭脚本 (Mode 2 终极版)
 * @supported Quantumult X (v1.5.2+)
 *
 * 核心突破原理（基于真实抓包逆向）：
 * 1. 为什么之前会等 60 秒且需要手动点关闭？
 *    - 抓包证实 Unity LevelPlay 聚合平台同时接入了 AppLovin 和 Google AdMob 两个激励广告源。
 *    - AppLovin 的广告响应是私有加密二进制 (1:578efbfe...)，其 60 秒倒计时与右上角关闭按钮由原生 Objective-C 视图硬编码锁定，网页 JS 无法跳过。
 *    - 但 Google AdMob 的激励广告 (googleads.g.doubleclick.net/cads/fetch/gbid_sdk) 是 100% 由 WebView 内的明文 HTML + google.afma 桥接控制的！
 *
 * 2. 解决方案：
 *    - 在分流层直接 reject 掉 AppLovin (a4.applovin.com / ms.applovin.com)，强制 Unity LevelPlay 100% 选用 Google AdMob 激励广告！
 *    - 拦截 AdMob 的 gbid_sdk 响应：
 *      a) 将 `<meta name="rewarded_fields">` 与配置中的 `30000` (30秒) / `60000` (60秒) 倒计时全部改为 `100` (0.1秒)，并将 `"enableSkipAdAtRewardGrantTime":false` 改为 `true`；
 *      b) 在 `ad_html` 中注入全自动领奖 + 自动关闭脚本：广告一弹出（0.3 秒），自动调用 AdMob 官方原生桥接：
 *         - `google.afma.support.notifyRewardedVideoStart()`
 *         - `google.afma.support.notifyRewardedVideoComplete()`
 *         - `google.afma.support.grantReward({amount: 1, type: "Virtual Item"})`
 *         - `mys.addon.getRewardedCountdownClose().grantReward("time_update")`
 *         随后在 0.8 秒自动调用 `mys.addon.getRewardedCountdownClose().close()` 与 `gmsg://mobileads.google.com/close` **全自动关闭广告窗口**，无需手动点击！
 */

const url = $request.url;
let body = $response.body;

if (!body) {
    $done({});
} else {
    try {
        // =========================================================================
        // 1. Gameloft 广告位总控 (a314.gameloft.com/un/index.hhh?event=init)
        // 剥离所有被动弹窗/横幅广告，只保留主动看广告领双倍金币/卡包/补油 (_IV / race_reward)
        // =========================================================================
        if (url.indexOf("a314.gameloft.com/un/index.hhh") !== -1) {
            let obj = JSON.parse(body);
            if (obj && obj.locations) {
                const keepLocations = {};
                for (const key in obj.locations) {
                    if (
                        key.indexOf("_IV") !== -1 ||
                        key.indexOf("race_reward") !== -1 ||
                        key === "loc_video" ||
                        key === "enter_section_open_card_pack"
                    ) {
                        keepLocations[key] = obj.locations[key];
                    }
                }
                obj.locations = keepLocations;
            }
            if (obj && obj.timeouts) {
                obj.timeouts.banner = 0;
                obj.timeouts.fullscreen = 0;
            }
            body = JSON.stringify(obj);
            $done({ body });
        }

        // =========================================================================
        // 2. Google AdMob 激励广告 (googleads.g.doubleclick.net/cads/fetch/gbid_sdk)
        // 0.1 秒倒计时 + 自动触发原生 grantReward 发金币 + 自动调用 close() 关闭广告！
        // =========================================================================
        else if (url.indexOf("googleads.g.doubleclick.net/cads/fetch/gbid_sdk") !== -1) {
            let obj = JSON.parse(body);
            if (obj && Array.isArray(obj.ad_networks)) {
                const autoGrantAndCloseScript = `<script>(function(){
  // 加速视频播放
  function fastVideo(){
    var vids = document.querySelectorAll('video');
    for(var i=0;i<vids.length;i++){
      try{
        vids[i].muted = true;
        vids[i].playbackRate = 16.0;
        if(vids[i].duration && vids[i].currentTime < vids[i].duration - 0.1){
          vids[i].currentTime = vids[i].duration - 0.05;
        }
      }catch(e){}
    }
  }
  setInterval(fastVideo, 100);

  // 发送 GMSG 原生指令辅助函数
  function sendGmsg(urlStr){
    try{
      if(window.googleAdsJsInterface && window.googleAdsJsInterface.notify){
        window.googleAdsJsInterface.notify(urlStr);
      } else if(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.gadGMSGObjectHandler){
        window.webkit.messageHandlers.gadGMSGObjectHandler.postMessage(urlStr);
      } else {
        var ifr = document.createElement('iframe');
        ifr.style.display = 'none';
        ifr.src = urlStr;
        document.documentElement.appendChild(ifr);
      }
    }catch(e){}
  }

  // 第一步：0.25 秒自动触发视频开始与播放完成 + 发放奖励
  function step1Grant(){
    try{
      if(window.google && window.google.afma && window.google.afma.support){
        if(window.google.afma.support.notifyRewardedVideoStart) window.google.afma.support.notifyRewardedVideoStart();
        if(window.google.afma.support.notifyRewardedVideoComplete) window.google.afma.support.notifyRewardedVideoComplete();
        if(window.google.afma.support.grantReward) window.google.afma.support.grantReward({amount:1, type:"Virtual Item"});
      }
      if(window.oneAfmaInstance){
        if(window.oneAfmaInstance.notifyRewardedVideoStart) window.oneAfmaInstance.notifyRewardedVideoStart();
        if(window.oneAfmaInstance.notifyRewardedVideoComplete) window.oneAfmaInstance.notifyRewardedVideoComplete();
        if(window.oneAfmaInstance.grantReward) window.oneAfmaInstance.grantReward({amount:1, type:"Virtual Item"});
      }
      if(window.mys && window.mys.addon && window.mys.addon.getRewardedCountdownClose){
        var rcc = window.mys.addon.getRewardedCountdownClose();
        if(rcc){
          if(rcc.sync) rcc.sync(0);
          if(rcc.enable) rcc.enable();
          if(rcc.grantReward && (!rcc.isRewardGranted || !rcc.isRewardGranted())) rcc.grantReward("time_update");
        }
      }
      sendGmsg("gmsg://mobileads.google.com/reward?action=video_start");
      sendGmsg("gmsg://mobileads.google.com/reward?action=video_complete");
      sendGmsg("gmsg://mobileads.google.com/reward?action=grant&amount=1&type=Virtual%20Item");
    }catch(e){}
  }

  // 第二步：0.75 秒自动关闭广告页面，无需手动点击右上角 X
  function step2Close(){
    try{
      if(window.mys && window.mys.addon && window.mys.addon.getRewardedCountdownClose){
        var rcc = window.mys.addon.getRewardedCountdownClose();
        if(rcc && rcc.close) rcc.close();
      }
      if(window.oneAfmaInstance && window.oneAfmaInstance.close){
        window.oneAfmaInstance.close();
      }
      sendGmsg("gmsg://mobileads.google.com/close");
      sendGmsg("gmsg://mobileads.google.com/close?a=notifyParent");
    }catch(e){}
  }

  window.addEventListener('DOMContentLoaded', function(){
    setTimeout(step1Grant, 250);
    setTimeout(step1Grant, 500);
    setTimeout(step2Close, 800);
    setTimeout(step2Close, 1300);
  });
  setTimeout(step1Grant, 400);
  setTimeout(step2Close, 950);
  setTimeout(step2Close, 1500);
})();</script>`;

                for (let net of obj.ad_networks) {
                    if (net.ad && typeof net.ad.ad_html === "string") {
                        let h = net.ad.ad_html;
                        // 将所有 30000 / 40000 / 60000 毫秒倒计时改为 100 毫秒 (0.1秒)，30 秒改为 0 秒
                        h = h
                            .replace(/\[30000,null,null,null,1,null,\[null,null,null,null,null,30,/g, "[100,null,null,null,1,null,[null,null,null,null,null,0,")
                            .replace(/,60000,&quot;cancel_ad&quot;/g, ",100,&quot;cancel_ad&quot;")
                            .replace(/,60000,0\]/g, ",100,0]")
                            .replace(/,30000,0\]/g, ",100,0]")
                            .replace(/,40000,\[/g, ",100,[")
                            .replace(/&quot;enableSkipAdAtRewardGrantTime&quot;:false/g, "&quot;enableSkipAdAtRewardGrantTime&quot;:true")
                            .replace(/"enableSkipAdAtRewardGrantTime":false/g, '"enableSkipAdAtRewardGrantTime":true');
                        // 注入自动领奖与自动关闭脚本
                        h = h.replace("<head>", "<head>" + autoGrantAndCloseScript);
                        net.ad.ad_html = h;
                    }
                }
            }
            body = JSON.stringify(obj);
            $done({ body });
        } else {
            $done({});
        }
    } catch (e) {
        console.log("Asphalt9_AdReward.js error: " + e);
        $done({});
    }
}
