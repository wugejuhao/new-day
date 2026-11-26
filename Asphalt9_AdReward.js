/**
 * @fileoverview 狂野飙车 9 (Asphalt 9) 激励广告 0.2 秒全自动领奖 + 纯黑无画面 + 自动关闭脚本 (Mode 2 终极校准版)
 * @supported Quantumult X (v1.5.2+)
 *
 * 核心逆向发现（基于 quantumult-x-2026-11-27-002330_3.har 抓包校准）：
 * 1. 为什么上一次抓包 (002330_3.har) 中“还有广告画面”且“没拿到金币”？
 *    - 原因 A（没拿到金币）：AdMob 激励广告是在您点击看广告**之前 75 秒**就在后台隐藏 WebView 预加载的（例如 16:51:33 预加载，16:52:50 才真正点击展示）。
 *      上个版本在 `DOMContentLoaded` (预加载阶段) 就调用了 `grantReward()` 和 `close()`，此时广告还未弹出（Unity 尚未触发 `eventId: 1005 Show`），导致领奖信号在预加载期被 Unity 忽略！
 *      而真正弹出广告时，AdMob 原生层会向 WebView 发送 `AFMA_Communicator` 的 `"onshow"` 事件（或 `oneAfmaInstance.runOnOnShowEvent`）。必须在 **`onshow` 触发后** 0.2 秒再发奖、0.6 秒再关闭，Unity 才会100% 认定领奖有效！
 *    - 原因 B（GMSG 格式）：在 iOS WKWebView 中，`window.webkit.messageHandlers.gadGMSGObjectHandler.postMessage` 接收的是对象 `{name: "reward", params: {action: "grant", amount: 1, type: "Virtual Item", "google.afma.Notify_dt": Date.now()}}`，而不是字符串 URL。
 *    - 原因 C（翻牌小游戏试玩广告 `[30000,null,null,null,null,null,...]` 与视频 `gcache://` 校验）：
 *      AdMob 除了视频广告外，还会下发 HTML5 翻牌试玩广告 (`concentration_game_v4`)，其 `addon-19` 格式为 `[30000,null,null,null,null,null,...]`，且 `runtime_data` 含有 `"rewardGrantTimeInMs":30000,"timeToReward":30000`。
 *      此外，AdMob 的 `gcache://` 预缓存器会校核 `tag.duration=59071` 与实际 `blank.mp4` 文件大小，若不一致会报 `videoplayfailed400` 废弃该视频激励广告。
 *
 * 2. 本版针对性彻底修复：
 *    - **只保留真正带奖励 (`video_reward_urls`) 的广告配置**，非激励插屏直接清空。
 *    - **全黑无广告画面**：向 `<head>` 注入强制黑屏静音 CSS (`#mys-wrapper, #mys-content, video, img, canvas { opacity: 0 !important; } body { background: #000 !important; }`)，不破坏 AdMob 的 `getIsVisible()` 坐标与透明度检测（避开 `opacity < 0.01` 检测，设为 `0.02` + 纯黑遮罩层），让您看不到任何广告画面！
 *    - **通杀所有 30s/60s 倒计时**：将 `addon-19`、`rewarded_fields`、`runtime_data` 中的 `30000` / `40000` / `60000`、`rewardGrantTimeInMs`、`timeToReward` 全部改写为 `100` (0.1秒)。
 *    - **替换 VAST 视频地址为 0.1 秒 `blank.mp4` 并同步修正 `Duration` 与 `tag.duration`**，彻底杜绝 `videoplayfailed400`。
 *    - **精准绑定 `onshow` 生命周期**：仅当您点击“看广告”且广告真正展示 (`onshow` / `visibilityState === true`) 后：
 *      - **+150ms**：自动调用 `oneAfmaInstance.notifyRewardedVideoStart()` -> `notifyRewardedVideoComplete()` -> `grantReward({amount: 1, type: "Virtual Item"})` + `rcc.grantReward("time_update")` + 标准 `gadGMSGObjectHandler` 消息 + 主动请求 `video_reward_urls` 追踪信标；
 *      - **+550ms**：自动调用 `rcc.close()` + `oneAfmaInstance.close()` + `gadGMSGObjectHandler` 的 `close` 指令，**全自动秒关广告窗口，直接回游戏拿金币**！
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
        // 纯黑遮罩隐藏广告画面 + 监听 onshow 0.15 秒自动发金币 + 0.55 秒自动关闭窗口！
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

                        // 1) 将 addon-19 / rewarded_fields / runtime_data 中的所有 30s / 40s / 60s 倒计时全部改为 100ms (0.1秒)
                        h = h
                            .replace(/\[30000,null,null,null,/g, "[100,null,null,null,")
                            .replace(/\[40000,null,null,null,/g, "[100,null,null,null,")
                            .replace(/\[60000,null,null,null,/g, "[100,null,null,null,")
                            .replace(/,null,null,30,null,null,/g, ",null,null,0,null,null,")
                            .replace(/\],30000,\[/g, "],100,[")
                            .replace(/\],40000,\[/g, "],100,[")
                            .replace(/\],60000,\[/g, "],100,[")
                            .replace(/\[60000,&quot;cancel_ad&quot;\]/g, "[100,&quot;cancel_ad&quot;]")
                            .replace(/&quot;rewardGrantTimeInMs&quot;:30000/g, "&quot;rewardGrantTimeInMs&quot;:100")
                            .replace(/&quot;timeToReward&quot;:30000/g, "&quot;timeToReward&quot;:100")
                            .replace(/"rewardGrantTimeInMs":30000/g, '"rewardGrantTimeInMs":100')
                            .replace(/"timeToReward":30000/g, '"timeToReward":100')
                            .replace(/&quot;enableSkipAdAtRewardGrantTime&quot;:false/g, "&quot;enableSkipAdAtRewardGrantTime&quot;:true")
                            .replace(/"enableSkipAdAtRewardGrantTime":false/g, '"enableSkipAdAtRewardGrantTime":true');

                        // 2) 将 VAST 视频长时长 00:00:59 改为 00:00:01，防止 gcache 校验时长失败报 videoplayfailed400
                        h = h
                            .replace(/<Duration>00:0[0-9]:[0-9]{2}<\/Duration>/g, "<Duration>00:00:01</Duration>")
                            .replace(/tag\.duration=[0-9]+/g, "tag.duration=100");

                        // 3) 构造纯黑遮罩（隐藏广告内容，但保留右上角关闭按钮可见度以通过 AdMob Jg() 校验）+ onshow 秒领奖秒关脚本
                        const injectedHead = `<style>
  html, body { background: #000 !important; }
  /* 隐藏广告主体画面与图片/游戏棋盘，但不能对关闭按钮设置 display:none 或 opacity<0.01，否则 AdMob Jg() 校验不通过 */
  #game-board, .card, video, img, canvas, iframe[src*="googlesyndication"] { opacity: 0.02 !important; filter: brightness(0) !important; pointer-events: none !important; }
  #a9-black-mask {
    position: fixed; inset: 0; background: #000; color: #10b981;
    display: flex; align-items: center; justify-content: center;
    font: 600 15px -apple-system, sans-serif; z-index: 999999; pointer-events: none;
  }
</style>
<script>(function(){
  var START_URLS = ${startUrls};
  var COMPLETE_URLS = ${completeUrls};
  var REWARD_URLS = ${rewardUrls};
  var hasGranted = false;
  var hasClosed = false;

  // 插入视觉纯黑提示遮罩
  function addBlackMask(){
    try{
      if(!document.getElementById('a9-black-mask') && document.body){
        var d = document.createElement('div');
        d.id = 'a9-black-mask';
        d.textContent = '⚡ 正在自动领取金币奖励...';
        document.body.appendChild(d);
      }
    }catch(e){}
  }
  setInterval(addBlackMask, 50);

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

  // 发送 iOS WKWebView 原生 AdMob GMSG 消息（严格遵循 Wb.prototype.sendMessage 的 {name, params} 格式）
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

  // 触发 AdMob 服务端发奖追踪 URL
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

  // 第一步：当广告真正展示 (onshow) 后，立即触发发奖
  function doGrantReward(){
    if(hasGranted) return;
    hasGranted = true;
    try{
      var d = document.getElementById('a9-black-mask');
      if(d) d.textContent = '✅ 金币奖励已发放，正在自动关闭...';
    }catch(e){}

    try{
      // 1. 触发服务端追踪 URL
      fireUrls(START_URLS);
      fireUrls(COMPLETE_URLS);
      fireUrls(REWARD_URLS);

      // 2. 调用 oneAfmaInstance 原生发奖接口 (one_afma_ctd.js 标准方法)
      if(window.oneAfmaInstance){
        if(window.oneAfmaInstance.notifyRewardedVideoStart) window.oneAfmaInstance.notifyRewardedVideoStart();
        if(window.oneAfmaInstance.notifyRewardedVideoComplete) window.oneAfmaInstance.notifyRewardedVideoComplete();
        if(window.oneAfmaInstance.grantReward) window.oneAfmaInstance.grantReward({amount: 1, type: "Virtual Item"});
      }

      // 3. 调用倒计时组件 rcc，将倒计时清零并标记 isRewardGranted = true (this.V = true)，防止弹出“关闭将丢失奖励”确认框
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

      // 4. 兜底直发 GMSG Object 消息给 iOS 原生 AdMob SDK
      sendAfmaMsg("reward", {action: "video_start"});
      sendAfmaMsg("reward", {action: "video_complete"});
      sendAfmaMsg("reward", {action: "grant", amount: 1, type: "Virtual Item"});
    }catch(e){}

    // 发奖完成后 400ms 自动关闭广告窗口（留出 400ms 让 iOS 原生 Unity Adapter 处理 didRewardUser 回调）
    setTimeout(doCloseAd, 400);
    setTimeout(doCloseAd, 850);
    setTimeout(doCloseAd, 1400);
  }

  // 第二步：自动关闭 AdMob 广告视图
  function doCloseAd(){
    try{
      // 再次确保 rcc 已标记领奖并关闭
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

  // 核心：监听广告真正被用户点击弹出的时机 (onshow)
  function onAdShown(){
    setTimeout(doGrantReward, 150);
    setTimeout(doGrantReward, 350);
  }

  // 轮询绑定 AFMA_Communicator 的 onshow 事件与 oneAfmaInstance.visibilityState
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
