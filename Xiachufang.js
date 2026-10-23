// ==UserScript==
// @ScriptName        下厨房 VIP 数据处理脚本
// @Author            @wugejuhao
// @Function          拦截前置校验与用户档案，强制注入 VIP 字段
// @UpdateTime        2026-10-23
// ==/UserScript==

let body = $response.body;
const url = $request.url;

if (body) {
    try {
        let obj = JSON.parse(body);
        
        // 判断是否为成功响应
        if (obj && typeof obj === 'object') {
            
            // 处理 account/detail.json
            if (url.indexOf("account/detail") !== -1 && obj.content) {
                obj.content.is_vip = true;
                obj.content.is_plus = true;
                obj.content.is_expert = true;
                obj.content.vip_expired_at = "2099-12-31 23:59:59";
                obj.content.plus_expired_at = "2099-12-31 23:59:59";
            }
            
            // 处理 user/get_profile.json
            if (url.indexOf("user/get_profile") !== -1 && obj.data) {
                obj.data.is_vip = true;
                obj.data.is_plus = true;
                obj.data.is_expert = true;
            }
            
            // 处理 account/check_auth.json (早期鉴权放行)
            if (url.indexOf("account/check_auth") !== -1) {
                if(obj.result) {
                   obj.result.status = 0;
                }
            }

            // 通用降级兼容
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
