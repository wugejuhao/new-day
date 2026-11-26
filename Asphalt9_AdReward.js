/**
 * @fileoverview 狂野飙车 9 (Asphalt 9) 激励广告加速与净化脚本 (实验版 Mode 2)
 * @supported Quantumult X (v1.5.2+)
 *
 * 作用机制：
 * 1. [a314.gameloft.com/un/index.hhh?event=init]
 *    - 精准剥离横幅 (loc_banner)、强制插屏 (loc_interstitial)、积分墙 (tapjoy_offerwall) 及主菜单/车库/生涯章节切换时的被动广告位；
 *    - 完整保留所有带 `_IV` (Incentivized Video 激励视频) 及 `enter_section_race_reward` 的主动领金币/翻倍卡包/补油点位！
 *
 * 2. [res1.applovin.com/.*_js_load\.js] (4.7MB 的 Cocos/H5 互动试玩小游戏广告)
 *    - 将长达 60~180 秒且极耗电的 4.7MB 试玩小游戏广告替换为 1KB 极简自动完成卡片；
 *    - 页面加载后自动劫持 setTimeout/setInterval 加速 20 倍，并自动触发 super_html.game_end() 与 MRAID 完成状态，
 *      配合右上角原生关闭按钮快速触发 d.applovin.com/2.0/cr 服务端 S2S 领奖回调。
 *
 * 3. [googleads.g.doubleclick.net/cads/fetch/gbid_sdk] (Google AdMob 激励视频配置)
 *    - 将 HTML/VAST 中的 60000ms (60秒) / 30000ms (30秒) 强制倒计时阈值缩短，并注入 video playbackRate = 16 倍速自动完播钩子。
 */

const url = $request.url;
let body = $response.body;

if (!body) {
    $done({});
} else {
    try {
        // =========================================================================
        // 场景 1：Gameloft 广告位总控 (a314.gameloft.com/un/index.hhh?event=init)
        // 只保留主动看广告领金币/卡包/补油 (_IV / race_reward)，干掉所有被动插屏与横幅
        // =========================================================================
        if (url.indexOf("a314.gameloft.com/un/index.hhh") !== -1) {
            let obj = JSON.parse(body);
            if (obj && obj.locations) {
                const keepLocations = {};
                for (const key in obj.locations) {
                    // 保留所有 _IV (激励视频)、race_reward (赛后翻倍)、open_card_pack / loc_video (激励视频底层槽位)
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
        // 场景 2：AppLovin 4.7MB 互动试玩小游戏 (res1.applovin.com/..._js_load.js)
        // 替换为极简 1KB 极速完播器，省下 4.7MB 解析与 WebGL 渲染发热
        // =========================================================================
        else if (url.indexOf("res1.applovin.com/") !== -1 && url.indexOf("_js_load.js") !== -1) {
            const fastHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><style>body{margin:0;background:#111;color:#0f0;font-family:-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center}h2{margin:8px 0;font-size:20px}p{color:#aaa;font-size:14px;max-width:80%}.box{border:1px solid #333;padding:20px;border-radius:12px;background:#1a1a1a}</style><script src="mraid.js"></script></head><body><div class="box"><h2>⚡ 试玩广告已极速净化</h2><p id="st">正在触发奖励完成信号，请点击右上角 [×] 或 [>>] 领取金币奖励...</p></div><script>
(function(){
  // 劫持定时器加速 20 倍
  const _st = window.setTimeout, _si = window.setInterval;
  window.setTimeout = function(fn, t) { return _st(fn, Math.min(t || 0, 50)); };
  window.setInterval = function(fn, t) { return _si(fn, Math.min(t || 0, 50)); };
  window.super_html_channel = "applovin";
  function finishAd() {
    try {
      if (window.super_html && window.super_html.game_end) window.super_html.game_end();
      if (window.mraid) {
        if (window.mraid.fireEvent) window.mraid.fireEvent("ready");
      }
      if (window.al_onAdCompleted) window.al_onAdCompleted();
      if (window.webkit && window.webkit.messageHandlers) {
        for (let k in window.webkit.messageHandlers) {
          try { window.webkit.messageHandlers[k].postMessage({event:"completed",type:"reward"}); } catch(e){}
        }
      }
      document.getElementById("st").innerText = "✅ 奖励信号已发送！请点击右上角关闭按钮领奖";
    } catch(e) {}
  }
  if (window.mraid && window.mraid.getState && window.mraid.getState() === "loading") {
    window.mraid.addEventListener("ready", finishAd);
  }
  _st(finishAd, 100);
  _st(finishAd, 500);
  _st(finishAd, 1500);
})();
</script></body></html>`;
            const payload = "al_renderHtml(" + JSON.stringify({ html: fastHtml }) + ");";
            $done({ body: payload });
        }

        // =========================================================================
        // 场景 3：Google AdMob 激励视频广告 (googleads.g.doubleclick.net/cads/fetch/gbid_sdk)
        // 注入 HTML5 Video 16 倍速自动快进完播脚本 + 缩短倒计时参数
        // =========================================================================
        else if (url.indexOf("googleads.g.doubleclick.net/cads/fetch/gbid_sdk") !== -1) {
            // 将 AdMob 配置中的 60000ms (60s) / 30000ms (30s) 倒计时缩短为 1000ms (1s)
            body = body.replace(/,60000,0\]/g, ",1000,0]").replace(/,30000,0\]/g, ",1000,0]");
            let obj = JSON.parse(body);
            if (obj && Array.isArray(obj.ad_networks)) {
                const speedScript = `<script>(function(){
  function fastForward(){
    var vids = document.querySelectorAll('video');
    for(var i=0;i<vids.length;i++){
      try{
        vids[i].muted = true;
        vids[i].playbackRate = 16.0;
        if(vids[i].duration && vids[i].currentTime < vids[i].duration - 0.2){
          vids[i].currentTime = vids[i].duration - 0.1;
        }
      }catch(e){}
    }
  }
  setInterval(fastForward, 150);
  document.addEventListener('loadedmetadata', fastForward, true);
  document.addEventListener('play', fastForward, true);
})();</script>`;
                for (let net of obj.ad_networks) {
                    if (net.ad && typeof net.ad.ad_html === "string") {
                        net.ad.ad_html = net.ad.ad_html.replace("<head>", "<head>" + speedScript);
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
