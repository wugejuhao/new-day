/**
 * @fileoverview 狂野飙车 9 (Asphalt 9) 激励广告极速静默秒领 + 100% 彻底封杀被动广告脚本 (Mode 2 终极静默版)
 * @supported Quantumult X (v1.5.2+)
 *
 * 核心特性（基于 104626.har 真实抓包校准）：
 * 1. 100% 封杀开局/赛后被动全屏广告（不走缓存、不弹窗）：
 *    - 拦截 `a314.gameloft.com` 的 `location=loc_interstitial` 等所有被动广告请求，以及 `action === "show"` 的残次试玩包，直接返回 `{"action":"exit","error":"There is no content available2"}`；
 *    - 拦截 AdMob `gbid_sdk` 中所有非激励插屏广告（`isRewardedAd === false`，无 `video_reward_urls`），直接清空 `ad_networks: []` 拒绝填充，彻底杜绝任何开局/赛后被动广告弹出！
 * 2. 主动看广告领金币：纯黑无字、0.55 秒到账、1.2 秒极限关窗：
 *    - 仅保留主动看广告领双倍/多倍金币、免费卡包、补油激励广告（`isRewardedAd === true`）；
 *    - 纯黑背景一闪即过，无任何提示文字；
 *    - `onshow` 瞬间：`0ms` 启动 -> `+60ms` 发奖 (`grantReward`) -> `+220ms / +380ms / +550ms` 密集调用 `close()` 毫秒级关窗；
 *    - 统一替换 `gcache://` 缓存键为 `8888888888888888`，永久零流量复用 6KB `blank.mp4`，并屏蔽 App Store 弹窗 (`SKSPVC`)。
 */

const url = $request.url;
let body = $response.body;

if (!body) {
    $done({});
} else {
    try {
        // =========================================================================
        // 1. Gameloft 广告接口 (a314.gameloft.com/un/index.hhh)
        // =========================================================================
        if (url.indexOf("a314.gameloft.com/un/index.hhh") !== -1) {
            // 1A. 初始化广告位总控 (event=init)：剥离所有被动插屏/横幅点位，仅保留主动领奖点位
            if (url.indexOf("event=init") !== -1) {
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
            // 1B. 其他所有 a314 请求（如 location=loc_interstitial 被动插屏，或 location=loc_video 下发 action=show 的自投广告）：
            //     放行 151B 的 programmatic 聚合配置，但只要是 action="show" 的具体广告内容一律返回 exit，
            //     既 100% 根除开局/赛后被动广告，又强制激励广告 100% 走 0.55 秒秒领的 AdMob 通道！
            else {
                let obj = JSON.parse(body);
                if (obj && obj.action === "show") {
                    $done({
                        body: JSON.stringify({
                            action: "exit",
                            error: "There is no content available2"
                        })
                    });
                } else {
                    $done({});
                }
            }
        }

        // =========================================================================
        // 2. Google AdMob 广告请求 (googleads.g.doubleclick.net/cads/fetch/gbid_sdk)
        // =========================================================================
        else if (url.indexOf("googleads.g.doubleclick.net/cads/fetch/gbid_sdk") !== -1) {
            let obj = JSON.parse(body);
            if (obj && Array.isArray(obj.ad_networks)) {
                const filteredNetworks = [];
                for (let net of obj.ad_networks) {
                    if (net.ad && typeof net.ad.ad_html === "string") {
                        let h = net.ad.ad_html;
                        const isRewardedAd =
                            (net.video_reward_urls && net.video_reward_urls.length > 0) ||
                            h.indexOf("rewarded_fields") !== -1 ||
                            h.indexOf("Reward granted") !== -1;

                        // 【关键新增】如果是非激励的被动插屏广告 (adFormat=2, isRewardedAd=false)，直接丢弃不填充！
                        // 彻底杜绝刚开始玩或赛后被动弹出广告！
                        if (!isRewardedAd) {
                            continue;
                        }

                        // 1) 仅修改领奖倒计时（addon-19 / rewarded_fields / runtime_data），绝不修改 [60000,"cancel_ad"] 预加载超时！
                        h = h
                            .replace(/\[30000,null,null,null,/g, "[100,null,null,null,")
                            .replace(/\[40000,null,null,null,/g, "[100,null,null,null,")
                            .replace(/\[60000,null,null,null,/g, "[100,null,null,null,")
                            .replace(/,null,null,30,null,null,/g, ",null,null,0,null,null,")
                            .replace(/\],30000,\[/g, "],100,[")
                            .replace(/\],40000,\[/g, "],100,[")
                            .replace(/\],60000,\[/g, "],100,[")
                            .replace(/&quot;rewardGrantTimeInMs&quot;:30000/g, "&quot;rewardGrantTimeInMs&quot;:100")
                            .replace(/&quot;timeToReward&quot;:30000/g, "&quot;timeToReward&quot;:100")
                            .replace(/"rewardGrantTimeInMs":30000/g, '"rewardGrantTimeInMs":100')
                            .replace(/"timeToReward":30000/g, '"timeToReward":100')
                            .replace(/&quot;enableSkipAdAtRewardGrantTime&quot;:false/g, "&quot;enableSkipAdAtRewardGrantTime&quot;:true")
                            .replace(/"enableSkipAdAtRewardGrantTime":false/g, '"enableSkipAdAtRewardGrantTime":true')
                            .replace(/&quot;enable_spa&quot;:true/g, "&quot;enable_spa&quot;:false")
                            .replace(/"enable_spa":true/g, '"enable_spa":false')
                            .replace(/&quot;enableIosRewardedPoddedSkspvc&quot;:true/g, "&quot;enableIosRewardedPoddedSkspvc&quot;:false")
                            .replace(/&lt;Duration&gt;00:0[0-9]:[0-9]{2}&lt;\/Duration&gt;/g, "&lt;Duration&gt;00:00:01&lt;/Duration&gt;");

                        // 2) 统一替换所有 gcache 缓存键为全新干净共享 ID 8888888888888888
                        const gcacheMatch = h.match(/gcache:\/\/video\/media\/(-?\d+)\?/);
                        if (gcacheMatch && gcacheMatch[1]) {
                            const oldId = gcacheMatch[1];
                            h = h.split(oldId).join("8888888888888888");
                        }

                        // 3) 注入纯黑无字遮罩 + 屏蔽 App Store 弹窗 + 极限速度 onshow 秒领秒关脚本
                        const injectedHead = `<style>
  html, body { background: #000 !important; }
  #game-board, .card, video, img, canvas, iframe[src*="googlesyndication"] { opacity: 0.02 !important; filter: brightness(0) !important; pointer-events: none !important; }
  #a9-black-mask { position: fixed; inset: 0; background: #000; z-index: 999999; pointer-events: none; }
</style>
<script>(function(){
  var started = false;
  var granted = false;

  function ensureBlackMask(){
    try{
      if(!document.getElementById('a9-black-mask') && document.body){
        var d = document.createElement('div');
        d.id = 'a9-black-mask';
        document.body.appendChild(d);
      }
    }catch(e){}
  }

  function blockStorePopups(){
    try{
      var o = window.oneAfmaInstance;
      if(o && !o.__a9StoreBlocked){
        o.__a9StoreBlocked = true;
        var noop = function(){};
        o.openInAppStore = noop;
        o.openSKOverlay = noop;
        o.openIntentOrNativeApp = noop;
        o.openApp = noop;
        o.openSystemBrowser = noop;
      }
    }catch(e){}
  }

  function sendAfmaMsg(msgName, paramsObj){
    var p = paramsObj || {};
    try{
      if(window.AFMA_Communicator && window.AFMA_Communicator.sendMessage){
        window.AFMA_Communicator.sendMessage(msgName, p);
        return;
      }
    }catch(e){}
    try{
      if(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.gadGMSGObjectHandler){
        var copy = {};
        for(var k in p) copy[k] = p[k];
        copy["google.afma.Notify_dt"] = (new Date).getTime();
        window.webkit.messageHandlers.gadGMSGObjectHandler.postMessage({name: msgName, params: copy});
      }
    }catch(e){}
  }

  function step1Start(){
    if(started) return;
    started = true;
    blockStorePopups();
    try{
      if(window.oneAfmaInstance && window.oneAfmaInstance.notifyRewardedVideoStart){
        window.oneAfmaInstance.notifyRewardedVideoStart();
      } else {
        sendAfmaMsg("reward", {action: "video_start"});
      }
    }catch(e){}
  }

  function step2Grant(){
    if(granted) return;
    granted = true;
    blockStorePopups();
    try{
      if(window.oneAfmaInstance){
        if(window.oneAfmaInstance.notifyRewardedVideoComplete) window.oneAfmaInstance.notifyRewardedVideoComplete();
        if(window.oneAfmaInstance.grantReward) window.oneAfmaInstance.grantReward({amount: 1, type: "Virtual Item"});
      } else {
        sendAfmaMsg("reward", {action: "video_complete"});
        sendAfmaMsg("reward", {action: "grant", amount: 1, type: "Virtual Item"});
      }

      if(window.mys && window.mys.addon && window.mys.addon.getRewardedCountdownClose){
        var rcc = window.mys.addon.getRewardedCountdownClose();
        if(rcc){
          if(rcc.sync) rcc.sync(0);
          if(rcc.enable) rcc.enable();
          if(rcc.grantReward && (!rcc.isRewardGranted || !rcc.isRewardGranted())){
            rcc.grantReward("time_update");
          }
        }
      }
    }catch(e){}
  }

  function step3Close(){
    blockStorePopups();
    try{
      if(window.mys && window.mys.addon && window.mys.addon.getRewardedCountdownClose){
        var rcc = window.mys.addon.getRewardedCountdownClose();
        if(rcc){
          if(rcc.grantReward && (!rcc.isRewardGranted || !rcc.isRewardGranted())){
            rcc.grantReward("time_update");
          }
          if(rcc.close) rcc.close();
        }
      }
      if(window.mys && window.mys.addon && window.mys.addon.close){
        var sc = window.mys.addon.close;
        if(sc && sc.close) sc.close();
      }
      if(window.oneAfmaInstance && window.oneAfmaInstance.close){
        window.oneAfmaInstance.close();
      }
      sendAfmaMsg("customClose", {custom_close: 0});
      sendAfmaMsg("close", {});
    }catch(e){}
  }

  var shownTriggered = false;
  function onAdShown(){
    if(shownTriggered) return;
    shownTriggered = true;
    blockStorePopups();
    ensureBlackMask();
    step1Start();
    setTimeout(step2Grant, 60);
    setTimeout(step3Close, 220);
    setTimeout(step3Close, 380);
    setTimeout(step3Close, 550);
    setTimeout(step3Close, 850);
  }

  function checkAndBind(){
    blockStorePopups();
    ensureBlackMask();
    try{
      var vids = document.querySelectorAll('video');
      for(var i=0;i<vids.length;i++){
        vids[i].muted = true;
        vids[i].playbackRate = 16.0;
        if(vids[i].duration && vids[i].currentTime < vids[i].duration - 0.05){
          vids[i].currentTime = vids[i].duration - 0.02;
        }
      }
    }catch(e){}
    try{
      if(window.oneAfmaInstance){
        if(window.oneAfmaInstance.visibilityState === true){
          onAdShown();
          return;
        }
        if(window.oneAfmaInstance.runOnOnShowEvent && !window.__a9BoundRunOnShow){
          window.__a9BoundRunOnShow = true;
          window.oneAfmaInstance.runOnOnShowEvent(onAdShown);
        }
      }
      if(window.AFMA_Communicator && window.AFMA_Communicator.addEventListener && !window.__a9BoundAfmaShow){
        window.__a9BoundAfmaShow = true;
        window.AFMA_Communicator.addEventListener("onshow", onAdShown);
      }
      var body = document.getElementById('mys-content') || document.body;
      if(body && body.classList && body.classList.contains('afma-on-show')){
        onAdShown();
      }
    }catch(e){}
  }

  checkAndBind();
  setInterval(checkAndBind, 16);
})();</script>`;

                        h = h.replace("<head>", "<head>" + injectedHead);
                        net.ad.ad_html = h;
                        filteredNetworks.push(net);
                    }
                }
                obj.ad_networks = filteredNetworks;
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
