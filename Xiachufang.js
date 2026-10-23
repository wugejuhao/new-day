// ==UserScript==
// @ScriptName        下厨房 VIP 点亮脚本
// @Author            @wugejuhao
// @Function          修改 account/detail 和 user/get_profile 响应实现本地 VIP 状态点亮
// @UpdateTime        2026-10-22
// @ScriptURL         https://raw.githubusercontent.com/wugejuhao/new-day/refs/heads/main/Xiachufang.js
// ==/UserScript==

let body = $response.body;

if (body) {
    try {
        let obj = JSON.parse(body);
        if (obj && typeof obj === 'object') {
            // 处理 account/detail.json
            if (obj.content) {
                obj.content.is_vip = true;
                obj.content.is_plus = true;
                obj.content.is_expert = true;
                // 设置远期到期时间 (2099年)
                obj.content.vip_expired_at = "2099-12-31 23:59:59";
                obj.content.plus_expired_at = "2099-12-31 23:59:59";
            }
            // 处理 user/get_profile.json (个人主页展示)
            if (obj.data) {
                obj.data.is_vip = true;
                obj.data.is_plus = true;
                obj.data.is_expert = true;
            }
            // 兼容性赋值（防止字段平铺在根目录）
            obj.is_vip = true;
            obj.is_plus = true;
            obj.is_expert = true;

            $done({ body: JSON.stringify(obj) });
        } else {
            $done({});
        }
    } catch (e) {
        $done({});
    }
} else {
    $done({});
}
