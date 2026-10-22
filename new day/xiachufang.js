// 下厨房会员核心字段修改脚本
const url = $request.url;
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
            // 处理 user/get_profile.json
            if (obj.data) {
                obj.data.is_vip = true;
                obj.data.is_plus = true;
                obj.data.is_expert = true;
            }
            // 兼容顶层字段
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
