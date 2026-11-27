/**
 * @fileoverview 狂野飙车 9 (Asphalt 9) 激励广告极速静默秒领 + 100% 彻底封杀被动广告脚本 (Mode 2 终极静默双引擎版)
 * @supported Quantumult X (v1.5.2+)
 *
 * 核心特性（基于 110708.har & 104626.har 真实抓包深度校准）：
 * 1. 【双引擎 100% 覆盖 Type-1 内联竞价 + Type-2 gbid_sdk 竞价】：
 *    - 引擎 A (`googleads.g.doubleclick.net/cads/fetch/gbid_sdk`)：在 JSON 层直接过滤被动插屏广告、改写倒计时与 `gcache://` 缓存键、注入 `<head>` 秒领脚本，并清除 `Alt-Svc: h3` 头防止 QUIC 绕过。
 *    - 引擎 B (`pagead2.googlesyndication.com` 的 `omsdk-v1.js` / `omid_session_bin.js` / `one_afma_ctd.js`)：当 Unity 聚合器 (`gw1.mediation.unity3d.com/auction`) 直接返回 80KB Type-1 内联加密竞价包（不经过 `gbid_sdk`）时，在 WKWebView `<head>` 同步执行 `omsdk-v1.js` 的第一毫秒启动 `MutationObserver`，在 `<body>` 解析出 `<meta name="video_fields">` / `<meta name="addon-19">` / `<meta name="rewarded_fields">` 的瞬间（早于 `rewarded_video.js` 读取前）实时改写 DOM 属性！
 * 2. 【100% 封杀开局/赛后被动全屏广告】：
 *    - `a314.gameloft.com`：剥离所有非激励广告位，且任何 `action === "show"` 的响应一律返回 `exit`；
 *    - `gbid_sdk`：直接丢弃 `isRewardedAd === false` 的被动插屏广告；
 *    - `WKWebView` 兜底：若 Type-1 内联竞价塞入了非激励插屏广告（DOM 中无 `rewarded_fields` 且无激励标识），在预加载阶段直接调用 `afmaCancelPageLoad()` / `delayPageLoaded?cancel=1` 令原生 SDK 销毁该广告，即便展示也 `0ms` 瞬时关闭！
 * 3. 【全场景主动看广告秒领（赛后 3倍/6倍/12倍/20倍金币、选车界面减少加燃料等待时间、补票、免费卡包）】：
 *    - 纯黑背景 (`#000`) 一闪即过，无任何提示文字；
 *    - `onshow` 瞬间：`0ms` 启动 -> `+60ms` 发奖 (`grantReward`) -> `+220ms / +380ms / +550ms` 毫秒级自动关窗；
 *    - 统一替换所有 `gcache://` 缓存键为干净 ID `8888888888888888`，彻底根除 `videoplayfailed400` 坏缓存导致的广告不可用，永久零流量复用 6KB `blank.mp4`，并屏蔽 App Store 底部弹窗 (`SKSPVC`)。
 */

const url = $request.url;
let body = $response.body;

// =========================================================================
// 通用 WKWebView 注入内核（同时支持 <head> 内联注入 & pagead2 外部 JS 头部注入）
// =========================================================================
const UNIVERSAL_WKWEBVIEW_HOOK = `(function(){
  if (window.__a9AdHookInstalled) return;
  window.__a9AdHookInstalled = true;

  var started = false;
  var granted = false;
  var shownTriggered = false;
  var nonRewardedCanceled = false;

  // 1) 立即注入纯黑无字样式，屏蔽一切画面闪现
  function injectBlackStyle(){
    try{
      if (document.getElementById('a9-black-style')) return;
      var root = document.head || document.documentElement;
      if (!root) return;
      var st = document.createElement('style');
      st.id = 'a9-black-style';
      st.textContent = 'html, body { background: #000 !important; } #game-board, .card, video, img, canvas, iframe[src*="googlesyndication"] { opacity: 0.02 !important; filter: brightness(0) !important; pointer-events: none !important; } #a9-black-mask { position: fixed; inset: 0; background: #000; z-index: 999999; pointer-events: none; }';
      root.appendChild(st);
    }catch(e){}
  }

  function ensureBlackMask(){
    injectBlackStyle();
    try{
      if(!document.getElementById('a9-black-mask') && document.body){
        var d = document.createElement('div');
        d.id = 'a9-black-mask';
        document.body.appendChild(d);
      }
    }catch(e){}
  }

  // 2) 实时改写 DOM 中的 <meta> 标签（在 rewarded_video.js / rewarded_countdown_close.js 读取前生效，完美攻克 Type-1 内联竞价）
  function patchMetaElement(m){
    try{
      if (!m || m.__a9Patched) return;
      var name = m.getAttribute('name');
      if (!name) return;
      var c = m.getAttribute('content');
      if (!c) return;

      if (name === 'video_fields') {
        var gm = c.match(/gcache:\\/\\/video\\/media\\/(-?\\d+)\\?/);
        if (gm && gm[1] && gm[1] !== '8888888888888888') {
          c = c.split(gm[1]).join('8888888888888888');
        }
        c = c.replace(/<Duration>00:0[0-9]:[0-9]{2}<\\/Duration>/g, '<Duration>00:00:01</Duration>');
        m.setAttribute('content', c);
        m.__a9Patched = true;
      } else if (name === 'addon-19' || name === 'rewarded_fields' || name === 'runtime_data') {
        c = c
          .replace(/\\[30000,null,null,null,/g, '[100,null,null,null,')
          .replace(/\\[40000,null,null,null,/g, '[100,null,null,null,')
          .replace(/\\[60000,null,null,null,/g, '[100,null,null,null,')
          .replace(/,null,null,30,null,null,/g, ',null,null,0,null,null,')
          .replace(/\\],30000,\\[/g, '],100,[')
          .replace(/\\],40000,\\[/g, '],100,[')
          .replace(/\\],60000,\\[/g, '],100,[')
          .replace(/"rewardGrantTimeInMs":30000/g, '"rewardGrantTimeInMs":100')
          .replace(/"timeToReward":30000/g, '"timeToReward":100')
          .replace(/"enableSkipAdAtRewardGrantTime":false/g, '"enableSkipAdAtRewardGrantTime":true')
          .replace(/"enable_spa":true/g, '"enable_spa":false')
          .replace(/"enableIosRewardedPoddedSkspvc":true/g, '"enableIosRewardedPoddedSkspvc":false');
        m.setAttribute('content', c);
        m.__a9Patched = true;
      }
    }catch(e){}
  }

  function patchAllMetas(){
    try{
      var metas = document.getElementsByTagName('meta');
      for (var i = 0; i < metas.length; i++) {
        patchMetaElement(metas[i]);
      }
    }catch(e){}
  }

  // 启动 MutationObserver 监听 <head> 与 <body> 中 <meta> 节点的创建，确保在 overallStart 前 100% 改写完毕
  try{
    patchAllMetas();
    injectBlackStyle();
    if (window.MutationObserver && document.documentElement) {
      var obs = new MutationObserver(function(mutations){
        for (var i = 0; i < mutations.length; i++) {
          var added = mutations[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var node = added[j];
            if (!node || node.nodeType !== 1) continue;
            if (node.tagName === 'META') {
              patchMetaElement(node);
            } else if (node.getElementsByTagName) {
              var innerMetas = node.getElementsByTagName('meta');
              for (var k = 0; k < innerMetas.length; k++) {
                patchMetaElement(innerMetas[k]);
              }
            }
          }
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }
    document.addEventListener('readystatechange', patchAllMetas, true);
    document.addEventListener('DOMContentLoaded', patchAllMetas, true);
  }catch(e){}

  // 3) 屏蔽 iOS App Store 底部弹出卡片 (SKSPVC / SKOverlay)
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

  // 检测当前 WKWebView 是否为激励广告（若为 Type-1 内联塞入的被动非激励插屏广告，直接取消加载并瞬时关窗）
  function isDomRewardedAd(){
    try{
      if (document.querySelector('meta[name="rewarded_fields"]')) return true;
      var a19 = document.querySelector('meta[name="addon-19"]');
      if (a19) {
        var c19 = a19.getAttribute('content') || '';
        if (c19.indexOf('Reward granted') !== -1 || c19.indexOf('rewardGrantTimeInMs') !== -1) return true;
      }
      var rt = document.querySelector('meta[name="runtime_data"]');
      if (rt) {
        var crt = rt.getAttribute('content') || '';
        if (crt.indexOf('rewardGrantTimeInMs') !== -1 || crt.indexOf('timeToReward') !== -1) return true;
      }
      if (window.mys && window.mys.addon && window.mys.addon.getRewardedCountdownClose) return true;
    }catch(e){}
    return false;
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

  function onAdShown(){
    if(shownTriggered) return;
    shownTriggered = true;
    patchAllMetas();
    blockStorePopups();
    ensureBlackMask();
    // 如果是非激励的被动插屏广告，0ms 直接关窗！
    if (document.readyState !== 'loading' && !isDomRewardedAd()) {
      step3Close();
      setTimeout(step3Close, 50);
      setTimeout(step3Close, 150);
      return;
    }
    step1Start();
    setTimeout(step2Grant, 60);
    setTimeout(step3Close, 220);
    setTimeout(step3Close, 380);
    setTimeout(step3Close, 550);
    setTimeout(step3Close, 850);
  }

  function checkAndBind(){
    patchAllMetas();
    blockStorePopups();
    ensureBlackMask();

    // 若 DOM 已解析完毕且检测到是 Type-1 内联塞入的被动非激励广告（含 #mys-meta 但无任何激励字段），在预加载阶段直接取消加载！
    try{
      if (!nonRewardedCanceled && (document.readyState === 'interactive' || document.readyState === 'complete')) {
        if (document.getElementById('mys-meta') && !isDomRewardedAd()) {
          nonRewardedCanceled = true;
          if (window.afmaCancelPageLoad) window.afmaCancelPageLoad();
          sendAfmaMsg("delayPageLoaded", {cancel: "1"});
        }
      }
    }catch(e){}

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
})();`;

if (!body) {
    $done({});
} else {
    try {
        // =========================================================================
        // 1. Gameloft 广告接口 (a314.gameloft.com/un/index.hhh)
        // =========================================================================
        if (url.indexOf("a314.gameloft.com/un/index.hhh") !== -1) {
            // 1A. 初始化广告位总控 (event=init)：剥离所有被动插屏/横幅点位，仅保留主动领奖点位
            //     （包含赛后多倍金币 race_reward、选车减少加燃料时间 enter_section_car_selection_IV、补票 ticket_refill_IV、免费卡包 card_packs_IV）
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
            // 1B. 其他所有 a314 请求（如 location=loc_interstitial 被动插屏，或下发 action=show 的自投广告）：
            //     放行 151B 的 programmatic 聚合配置，但只要是 action="show" 的具体广告内容一律返回 exit
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
        // 2. Google AdMob 核心 JS 注入 (pagead2.googlesyndication.com)
        //    —— 100% 拦截通过 gw1.mediation.unity3d.com/auction (80KB Type-1 内联竞价) 直接送入 WKWebView 的广告！
        // =========================================================================
        else if (url.indexOf("pagead2.googlesyndication.com/") !== -1) {
            body = ";" + UNIVERSAL_WKWEBVIEW_HOOK + "\n" + body;
            let headers = Object.assign({}, $response.headers || {});
            headers["Alt-Svc"] = "clear";
            headers["Cache-Control"] = "no-store";
            $done({ headers, body });
        }

        // =========================================================================
        // 3. Google AdMob 广告请求 (googleads.g.doubleclick.net/cads/fetch/gbid_sdk)
        //    —— Type-2 竞价 JSON 层清洗 + 注入
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

                        // 如果是非激励的被动插屏广告 (adFormat=2, isRewardedAd=false)，直接丢弃不填充！
                        if (!isRewardedAd) {
                            continue;
                        }

                        // 1) 修改领奖倒计时（addon-19 / rewarded_fields / runtime_data），绝不修改 [60000,"cancel_ad"] 预加载超时
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

                        // 3) 注入通用 WKWebView 纯黑无字秒领内核
                        const injectedHead = `<script>${UNIVERSAL_WKWEBVIEW_HOOK}</script>`;
                        h = h.replace("<head>", "<head>" + injectedHead);
                        net.ad.ad_html = h;
                        filteredNetworks.push(net);
                    }
                }
                obj.ad_networks = filteredNetworks;
            }
            body = JSON.stringify(obj);
            let headers = Object.assign({}, $response.headers || {});
            headers["Alt-Svc"] = "clear";
            $done({ headers, body });
        } else {
            $done({});
        }
    } catch (e) {
        console.log("Asphalt9_AdReward.js error: " + e);
        $done({});
    }
}
