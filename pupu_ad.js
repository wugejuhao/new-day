// pupu_ad.js
let body = $response.body;
if (body) {
    try {
        let obj = JSON.parse(body);
        
        // 清理常见的开屏、弹窗与轮播广告数据结构
        if (obj.data) {
            if (obj.data.splash) obj.data.splash = [];
            if (obj.data.banner) obj.data.banner = [];
            if (obj.data.startup_ad) obj.data.startup_ad = null;
        }
        
        if (obj.ads) obj.ads = [];

        body = JSON.stringify(obj);
    } catch (e) {
        console.log("朴朴去广告脚本解析失败: " + e);
    }
}
$done({body});