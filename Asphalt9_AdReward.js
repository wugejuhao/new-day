/**
 * @fileoverview 狂野飙车 9 (Asphalt 9) 激励广告 1 秒全自动领双倍金币 + 纯黑无画面 + 自动关闭脚本 (Mode 2 稳定校准版)
 * @supported Quantumult X (v1.5.2+)
 *
 * 基于 2026-11-27 01:06:27 (010627.har) 真实抓包定位并修复的两个致命 Bug：
 * 1. 修复 `rewarded_video_cancel_impression`（导致“没有加载好激励广告 / 点看广告没拿到双倍金币”）：
 *    - 此前脚本误把 `video_config` 中的 `[60000,"cancel_ad"]` 改成了 `[100,"cancel_ad"]`！
 *    - 抓包证实 `[60000,"cancel_ad"]` 是 AdMob 视频**后台预加载超时阈值**（60 秒），并非领奖倒计时！
 *    - 改成 100ms 后，AdMob 开始预加载视频 0.1 秒后就自杀取消了整条激励广告，导致 Unity 报 `No loaded ad (error 1000)`。
 *    - 本版彻底移除对该字段的修改，保留原始 60000ms 预加载容忍时间！
 *
 * 2. 修复 `videoplayfailed400`（配合 Asphalt9_AdReward.conf）：
 *    - `raw.githubusercontent.com` 返回 `Content-Type: application/octet-stream` + `X-Content-Type-Options: nosniff`，导致 iOS AVPlayer 拒播 `blank.mp4` 并抛出 VAST 400 错误。
 *    - 已改为通过 `cdn.jsdelivr.net/gh/wugejuhao/new-day@main/blank.mp4` 分发（实测返回 `HTTP 206` + `Content-Type: video/mp4` + `Accept-Ranges: bytes`），iOS AVPlayer 100% 兼容且 0.1 秒自然播完触发 `videoDone`！
 *
 * 3. 精准顺序时序（已通过 010627.har 验证 `onshow` 自动关窗 100% 生效）：
 *    - 后台预加载期完全静默，不提前发奖、不提前关窗；
 *    - 您点击看广告弹出 (`onshow`) 后：
 *      - `+150ms`：触发 `video_start`；
 *      - `+350ms`：触发 `video_complete` + `grantReward({amount:1, type:"Virtual Item"})` + `rcc.grantReward("time_update")` + 追踪信标；
 *      - `+950ms`：留足 600ms 让 iOS AdMob SDK & Unity LevelPlay Adapter 完成 `didRewardUser` 双倍金币回调后，自动调用 `close()` 关闭广告窗口！
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
                    const startUrls = JSON.stringify(net.video_start_urls || []);
                    const completeUrls = JSON.stringify(net.video_complete_urls || []);
                    const rewardUrls = JSON.stringify(net.video_reward_urls || []);

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
                            // VAST XML 中的视频时长（HTML 转义格式）缩短为 1 秒，与 0.1 秒 blank.mp4 匹配
                            .replace(/&lt;Duration&gt;00:0[0-9]:[0-9]{2}&lt;\/Duration&gt;/g, "&lt;Duration&gt;00:00:01&lt;/Duration&gt;");

                        // 2) 注入纯黑遮罩 + 精准 onshow 顺序发奖与关窗脚本
                        const injectedHead = `<style>
  html, body { background: #000 !important; }
  /* 隐藏广告画面与棋盘/视频，保留关闭按钮满足 AdMob 可见性校验 (>=0.01) */
  #game-board, .card, video, img, canvas, iframe[src*="googlesyndication"] { opacity: 0.02 !important; filter: brightness(0) !important; pointer-events: none !important; }
  #a9-black-mask {
    position: fixed; inset: 0; background: #000; color: #10b981;
    display: flex; align-items: center; justify-content: center;
    font: 600 15px -apple-system, sans-serif; z-index: 999999; pointer-events: none;
  }
</style>
<script>(function(){
  var IS_REWARDED = ${isRewardedAd ? "true" : "false"};
  var START_URLS = ${startUrls};
  var COMPLETE_URLS = ${completeUrls};
  var REWARD_URLS = ${rewardUrls};
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
  setInterval(function(){
    if(!document.getElementById('a9-black-mask') && document.body){
      setMaskText(IS_REWARDED ? '⚡ 正在自动领取双倍金币...' : '⚡ 正在自动跳过广告...');
    }
  }, 50);

  // 静音并 16 倍速快进所有视频
  setInterval(function(){
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
  }, 80);

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

  function fireUrls(arr){
    if(!arr || !arr.length) return;
    for(var i=0;i<arr.length;i++){
      try{
        if(window.oneAfmaInstance && window.oneAfmaInstance.httpTrack){
          window.oneAfmaInstance.httpTrack(arr[i]);
        } else {
          var img = new Image();
          img.src = arr[i];
        }
      }catch(e){}
    }
  }

  // 步骤 1：通知原生层视频已开始播放
  function step1Start(){
    if(started) return;
    started = true;
    try{
      fireUrls(START_URLS);
      if(window.oneAfmaInstance && window.oneAfmaInstance.notifyRewardedVideoStart){
        window.oneAfmaInstance.notifyRewardedVideoStart();
      }
      sendAfmaMsg("reward", {action: "video_start"});
    }catch(e){}
  }

  // 步骤 2：通知原生层视频已播完 + 正式发放双倍金币奖励
  function step2Grant(){
    if(granted) return;
    granted = true;
    setMaskText('✅ 双倍金币已发放，正在自动关闭...');
    try{
      fireUrls(COMPLETE_URLS);
      fireUrls(REWARD_URLS);

      if(window.oneAfmaInstance){
        if(window.oneAfmaInstance.notifyRewardedVideoComplete) window.oneAfmaInstance.notifyRewardedVideoComplete();
        if(window.oneAfmaInstance.grantReward) window.oneAfmaInstance.grantReward({amount: 1, type: "Virtual Item"});
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

      sendAfmaMsg("reward", {action: "video_complete"});
      sendAfmaMsg("reward", {action: "grant", amount: 1, type: "Virtual Item"});
    }catch(e){}
  }

  // 步骤 3：关闭广告窗口返回游戏
  function step3Close(){
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

  // 仅在广告真正弹出展示 (onshow) 后按顺序执行
  var shownTriggered = false;
  function onAdShown(){
    if(shownTriggered) return;
    shownTriggered = true;
    if(IS_REWARDED){
      setTimeout(step1Start, 150);
      setTimeout(step2Grant, 350);
      setTimeout(step3Close, 950);
      setTimeout(step3Close, 1550);
    } else {
      // 非激励插屏广告：直接 0.25 秒秒关
      setTimeout(step3Close, 250);
      setTimeout(step3Close, 800);
    }
  }

  // 持续监听 onshow 生命周期（支持后台预加载几分钟后再点击展示）
  var bindTimer = setInterval(function(){
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
  }, 50);
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
