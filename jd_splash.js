// 京东极速开屏去广告脚本
var body = $response.body;
try {
    var obj = JSON.parse(body);
    // 清空开屏广告图片列表和展示次数，保留其他正常启动配置
    if (obj && obj.images) {
        obj.images = []; 
    }
    if (obj && obj.showTimesDaily) {
        obj.showTimesDaily = 0;
    }
    $done({ body: JSON.stringify(obj) });
} catch (e) {
    // 遇到异常直接放行，保证不卡顿
    $done({});
}
