/**
 * 朴朴超市去广告脚本 (Quantumult X 专用)
 * 适配自本地托管方案，移除了对外部仓库的依赖
 */

let body = $response.body;

if (body) {
    try {
        let obj = JSON.parse(body);
        let url = $request.url;

        // 1. 广告/开屏/弹窗/横幅
        if (url.indexOf("/marketing/advertisement/v1") !== -1) {
            if (obj.data) {
                if (obj.data.splash) obj.data.splash = [];        // 开屏广告
                if (obj.data.banners) obj.data.banners = [];      // 轮播横幅
                if (obj.data.popups) obj.data.popups = [];        // 弹窗广告
                if (obj.data.skin) obj.data.skin = {};            // 节日皮肤
            }
        }
        
        // 2. 热搜广告关键词
        else if (url.indexOf("/search/hot_keywords/v3") !== -1) {
            if (obj.data) obj.data = [];                          // 清空热搜推荐框
        }
        
        // 3. 搜索结果/搜索框背景词广告
        else if (url.indexOf("/search/hub/search_box/products/v6") !== -1) {
            if (obj.data) {
                if (obj.data.search_box_ad) obj.data.search_box_ad = null;
                if (obj.data.ad_list) obj.data.ad_list = [];
            }
        }
        
        // 4. 下单页/结算页广告横幅
        else if (url.indexOf("/order_settlement/detail") !== -1) {
            if (obj.data && obj.data.banner) {
                obj.data.banner = null;
            }
        }
        
        // 5. 订单列表活动横幅
        else if (url.indexOf("/order/orders/list/v4") !== -1) {
            if (obj.data && obj.data.banners) {
                obj.data.banners = [];
            }
        }

        // 通用兜底清理机制：若发现其他遗漏的常规广告字段，自动置空
        if (obj.data) {
            const commonAdKeys = ['splash', 'banner', 'banners', 'popup', 'popups', 'ads', 'ad_list'];
            commonAdKeys.forEach(key => {
                if (obj.data[key]) {
                    if (Array.isArray(obj.data[key])) obj.data[key] = [];
                    else if (typeof obj.data[key] === 'object') obj.data[key] = null;
                }
            });
        }

        body = JSON.stringify(obj);
    } catch (e) {
        console.log("朴朴去广告自主脚本解析失败: " + e);
    }
}

$done({ body });
