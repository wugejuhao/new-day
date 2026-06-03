/**
 * 项目名称：亲邻开门-AD净化(App+小程序)
 * 脚本特性：最优、省电、快速、不卡壳（原生JSON处理）
 * 仓库地址：https://github.com/wugejuhao/new-day
 */

var body = $response.body;

if (body) {
    try {
        var obj = JSON.parse(body, function(key, value) {
            // 安全清空广告列表
            if (key === 'list') return []; 
            // 清除广告占位图和ID
            if (key === 'newYearSkinBannerUrl' || key === 'defaultBannerUrl' || key === 'slotId') return "";
            // 关闭各种广告开关和排序
            if (key === 'groupId') return "0";
            if (key === 'mainSwitch' || key === 'slotModeSort') return 0;
            return value;
        });
        body = JSON.stringify(obj);
    } catch (e) {
        console.log("亲邻开门去广告解析异常: " + e);
    }
}

$done({ body });
