/**
 * @fileoverview 狂野飙车 9 (Asphalt 9) 激励广告 1.2 秒极速自动领双倍金币 + 防商店弹窗 + 自动关闭脚本 (Mode 2 终极优化版)
 * @supported Quantumult X (v1.5.2+)
 *
 * 基于 2026-11-27 01:20:29 (012029.har) 实测成功拿到双倍金币后的深度性能与体验优化：
 * 1. 屏蔽播完自动弹出的 iOS App Store 商店卡片 (`skspvc_triggered` / `SKOverlay`)：
 *    - 抓包发现 0.1 秒 `blank.mp4` 播完后会触发 `skspvc_triggered` 拉起 App Store 商店页。
 *    - 本版在注入脚本中实时劫持并置空 `oneAfmaInstance.openInAppStore` / `openSKOverlay` / `openIntentOrNativeApp` / `openApp`，彻底杜绝商店弹窗闪烁或误跳转。
 * 2. 极速时序压缩（总时长从 2.1 秒压缩至 ~1.2 秒）：
 *    - 抓包实测 `admob_reward_granted` -> Unity `eventId: 1010` 仅耗时 6ms。
 *    - 本版优化为：`+100ms` video_start -> `+250ms` video_complete + grantReward -> `+600ms` 自动关窗（保留 350ms 裕度确保 100% 到账）。
 * 3. 消除重复发奖网络信标：
 *    - 移除冗余的手动 `fireUrls`，完全交由 iOS 原生 AdMob SDK 触发标准的 1 次 start / complete / grant 信标，更省流量、更隐蔽自然。
 * 4. 绝不修改 `[60000,"cancel_ad"]` 预加载超时阈值，确保连续多局看广告 100% 稳定就绪。
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
        // =========================================================================
        else if (url.indexOf("googleads.g.doubleclick.net/cads/fetch/gbid_sdk") !== -1) {
            let obj = JSON.parse(body);
            if (obj && Array.isArray(obj.ad_networks)) {
                for (let net of obj.ad_networks) {
                    if (net.ad && typeof net.ad.ad_html === "string") {
                        let h = net.ad.ad_html;
                        const isRewardedAd =
                            (net.video_reward_urls && net.video_reward_urls.length > 0) ||
                            h.indexOf("rewarded_fields") !== -1 ||
                            h.indexOf("Reward granted") !== -1;

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
                            // 关闭结束卡片自动拉起 App Store 商店页开关
                            .replace(/&quot;enable_spa&quot;:true/g, "&quot;enable_spa&quot;:false")
                            .replace(/"enable_spa":true/g, '"enable_spa":false')
                            .replace(/&quot;enableIosRewardedPoddedSkspvc&quot;:true/g, "&quot;enableIosRewardedPoddedSkspvc&quot;:false")
                            // 将所有 gcache 缓存键统一指向全新的干净 ID，彻底绕开此前 raw.githubusercontent.com 遗留在手机本地的坏缓存，且后续所有广告 0 流量永久复用同一份 6KB 空白视频
                            .replace(/gcache:\/\/video\/media\/-?\d+\?/g, "gcache://video/media/8888888888888888?")
                            // VAST XML 中的视频时长（HTML 转义格式）缩短为 1 秒，与 0.1 秒 blank.mp4 匹配
                            .replace(/&lt;Duration&gt;00:0[0-9]:[0-9]{2}&lt;\/Duration&gt;/g, "&lt;Duration&gt;00:00:01&lt;/Duration&gt;");

                        // 2) 注入纯黑遮罩 + 屏蔽 App Store 弹窗 + 精准 onshow 极速发奖与关窗脚本
                        const injectedHead = `<style>
  html, body { background: #000 !important; }
  #game-board, .card, video, img, canvas, iframe[src*="googlesyndication"] { opacity: 0.02 !important; filter: brightness(0) !important; pointer-events: none !important; }
  #a9-black-mask {
    position: fixed; inset: 0; background: #000; color: #10b981;
    display: flex; align-items: center; justify-content: center;
    font: 600 15px -apple-system, sans-serif; z-index: 999999; pointer-events: none;
  }
</style>
<script>(function(){
  var IS_REWARDED = ${isRewardedAd ? "true" : "false"};
  var started = false;
  var granted = false;

  function setMaskText(txt){
    try{
      var d = document.getElementById('a9-black-mask');
      if(!d && document.body){
        d = document.createElement('div');
        d.id = 'a9-black-mask';
        document.body.appendChild(d);
      }
      if(d) d.textContent = txt;
    }catch(e){}
  }

  // 彻底屏蔽 App Store 商店弹窗 (SKStoreProductViewController / SKOverlay) 与外链跳转
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

  setInterval(function(){
    blockStorePopups();
    if(!document.getElementById('a9-black-mask') && document.body){
      setMaskText(IS_REWARDED ? '⚡ 正在自动领取双倍金币...' : '⚡ 正在自动跳过广告...');
    }
    var vids = document.querySelectorAll('video');
    for(var i=0;i<vids.length;i++){
      try{
        vids[i].muted = true;
        vids[i].playbackRate = 16.0;
        if(vids[i].duration && vids[i].currentTime < vids[i].duration - 0.05){
          vids[i].currentTime = vids[i].duration - 0.02;
        }
      }catch(e){}
    }
  }, 60);

  // 发送 iOS WKWebView 原生 AdMob GMSG 消息 ({name, params} 格式)
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

  // 步骤 1：通知原生层视频开始（不重复手动发 URL，交给 AdMob SDK 干净触发一次）
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

  // 步骤 2：通知原生层视频播完 + 发放双倍金币奖励
  function step2Grant(){
    if(granted) return;
    granted = true;
    blockStorePopups();
    setMaskText('✅ 双倍金币已发放，正在关闭...');
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

  // 步骤 3：关闭广告窗口返回游戏
  function step3Close(){
    blockStorePopups();
    try{
      if(IS_REWARDED && window.mys && window.mys.addon && window.mys.addon.getRewardedCountdownClose){
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

  // 仅在广告真正弹出展示 (onshow) 后按极速顺序执行
  var shownTriggered = false;
  function onAdShown(){
    if(shownTriggered) return;
    shownTriggered = true;
    blockStorePopups();
    if(IS_REWARDED){
      setTimeout(step1Start, 100);
      setTimeout(step2Grant, 250);
      setTimeout(step3Close, 600);
      setTimeout(step3Close, 1200);
    } else {
      setTimeout(step3Close, 200);
      setTimeout(step3Close, 700);
    }
  }

  // 持续监听 onshow 生命周期
  var bindTimer = setInterval(function(){
    blockStorePopups();
    try{
      if(window.oneAfmaInstance){
        if(window.oneAfmaInstance.visibilityState === true){
          clearInterval(bindTimer);
          onAdShown();
          return;
        }
        if(window.oneAfmaInstance.runOnOnShowEvent && !window.__a9BoundRunOnShow){
          window.__a9BoundRunOnShow = true;
          window.oneAfmaInstance.runOnOnShowEvent(function(){
            clearInterval(bindTimer);
            onAdShown();
          });
        }
      }
      if(window.AFMA_Communicator && window.AFMA_Communicator.addEventListener && !window.__a9BoundAfmaShow){
        window.__a9BoundAfmaShow = true;
        window.AFMA_Communicator.addEventListener("onshow", function(){
          clearInterval(bindTimer);
          onAdShown();
        });
      }
      var body = document.getElementById('mys-content') || document.body;
      if(body && body.classList && body.classList.contains('afma-on-show')){
        clearInterval(bindTimer);
        onAdShown();
      }
    }catch(e){}
  }, 40);
})();</script>`;

                        h = h.replace("<head>", "<head>" + injectedHead);
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
