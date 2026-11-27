/**
 * @fileoverview 狂野飙车 9 (Asphalt 9) 双通道激励广告极速静默秒领 + 自动关闭脚本 (Mode 2 极速无字版)
 * @supported Quantumult X (v1.5.2+)
 *
 * 核心特性（经 18 连看真实抓包 093052.har 校准）：
 * 1. 纯黑完全静默（无任何提示文字）：
 *    - 点击看广告时仅纯黑背景一闪即过，不弹出任何“正在领取双倍奖励”等文字。
 * 2. 理论极限速度（0ms 启动 -> 60ms 发奖 -> 220ms/380ms/550ms 密集关窗）：
 *    - 同步立即绑定 `onshow`，触发瞬间 0ms 发送 `video_start`，60ms 发送 `video_complete` + `grantReward`，
 *      随后在 220ms / 380ms / 550ms / 850ms 连续调用 `close()`，一旦 iOS 弹出动画结束立刻毫秒级关窗！
 * 3. AdMob + Gameloft 自家备用激励广告 (`loc_video`) 双通道全覆盖：
 *    - 清洗所有 `gcache://` 缓存键为 `8888888888888888`，0 流量永久复用 6KB `blank.mp4`，彻底杜绝 `videoplayfailed400`；
 *    - 保留 `[60000,"cancel_ad"]` 预加载超时，18 连看 100% 稳定出广告按钮；
 *    - 彻底屏蔽 App Store 商店弹窗 (`skspvc_triggered` / `SKOverlay`)。
 */

const url = $request.url;
let body = $response.body;

if (!body) {
    $done({});
} else {
    try {
        // =========================================================================
        // 1. Gameloft 广告位总控 & 自家备用激励视频 (a314.gameloft.com/un/index.hhh)
        // =========================================================================
        if (url.indexOf("a314.gameloft.com/un/index.hhh") !== -1) {
            // 1A. 初始化广告位总控 (event=init)
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
            // 1B. Gameloft 自家备用激励视频 (location=loc_video, prov=700673)
            else if (url.indexOf("location=loc_video") !== -1) {
                let obj = JSON.parse(body);
                if (
                    obj &&
                    obj.action === "show" &&
                    typeof obj.content === "string" &&
                    obj.content.indexOf("document.write(decodeURIComponent(window.atob(") !== -1
                ) {
                    // 纯黑无字 + 替换 0.1 秒 blank.mp4 + 播完 200ms 极速自动关窗
                    const wrapperStart =
                        `document.write((function(h){` +
                        `var b="https://cdn.jsdelivr.net/gh/wugejuhao/new-day@main/blank.mp4";` +
                        `h=h.replace(/var _videoPath\\s*=\\s*'[^']+'/g,"var _videoPath = '"+b+"'")` +
                        `.replace(/https:\\/\\/novac\\.djybls\\.gameloft\\.com\\/[^'"\\\\]+\\.mp4/g,b)` +
                        `.replace(/var videoLength\\s*=\\s*parseInt\\('[^']+'\\)/g,"var videoLength = 1")` +
                        `.replace(/"video_length":"[^"]+"/g,'"video_length":"1"');` +
                        `var patch='<style>html,body{background:#000!important;}video,img,#endScreenContainer{opacity:0.02!important;pointer-events:none!important;}#a9-gl-mask{position:fixed;inset:0;background:#000;z-index:999999;pointer-events:none;}</style>'` +
                        `+'<script>(function(){var closed=false;setInterval(function(){if(!document.getElementById("a9-gl-mask")&&document.body){var d=document.createElement("div");d.id="a9-gl-mask";document.body.appendChild(d);}var vs=document.querySelectorAll("video");for(var i=0;i<vs.length;i++){try{vs[i].muted=true;vs[i].playbackRate=16;if(vs[i].duration&&vs[i].currentTime<vs[i].duration-0.05)vs[i].currentTime=vs[i].duration-0.02;}catch(e){}}if(!closed&&window.vPlayer&&window.vPlayer.activity&&(window.vPlayer.activity.current==="ended"||window.vPlayer.activity.isEnded)){closed=true;var fn=function(){try{if(window.vPlayer&&window.vPlayer.close)window.vPlayer.close();else if(window.closeView)window.closeView();}catch(e){}};setTimeout(fn,200);setTimeout(fn,450);}},30);})();<\\/script>';` +
                        `return h.replace("<head>","<head>"+patch);` +
                        `})(decodeURIComponent(window.atob(`;

                    obj.content = obj.content
                        .replace("document.write(decodeURIComponent(window.atob(", wrapperStart)
                        .replace(")));</script>", "))));</script>");
                    body = JSON.stringify(obj);
                    $done({ body });
                } else {
                    $done({});
                }
            } else {
                $done({});
            }
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
  var IS_REWARDED = ${isRewardedAd ? "true" : "false"};
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

  // 触发 onshow 瞬间：0ms 启动 -> 60ms 发奖 -> 220ms/380ms/550ms/850ms 密集关窗（卡准 iOS 弹窗动画结束瞬间立即关闭）
  var shownTriggered = false;
  function onAdShown(){
    if(shownTriggered) return;
    shownTriggered = true;
    blockStorePopups();
    ensureBlackMask();
    if(IS_REWARDED){
      step1Start();
      setTimeout(step2Grant, 60);
      setTimeout(step3Close, 220);
      setTimeout(step3Close, 380);
      setTimeout(step3Close, 550);
      setTimeout(step3Close, 850);
    } else {
      setTimeout(step3Close, 50);
      setTimeout(step3Close, 220);
      setTimeout(step3Close, 450);
    }
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
