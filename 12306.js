/***********************************************

> 应用名称：12306 去广告脚本
> 脚本作者：@wugejuhao
> 更新时间：2026-06-03
> 脚本说明：优化重构版本，增强代码可读性。
> 使用说明：请在本地添加分流 host, ad.12306.cn, direct

[rewrite_local]
# 已经替换为你自己的 GitHub Raw 链接
^https?:\/\/ad\.12306\.cn\/ad\/ser\/getAdList url script-analyze-echo-response https://raw.githubusercontent.com/wugejuhao/new-day/main/12306.js

[mitm]
hostname = ad.12306.cn

***********************************************/

const version = 'V1.0.0';
let obj = JSON.parse($request.body);
let responseData = {};

// 针对不同的广告位进行数据替换
if (obj.placementNo === "0007") {
    responseData.materialsList = [{
        billMaterialsId: "6491",
        filePath: "wugejuhao", // 替换为你的专属标记
        creativeType: 1
    }];
    responseData.advertParam = { skipTime: 1 };
    responseData.code = "00";
} else if (obj.placementNo === "G0054") {
    responseData = {
        code: "00",
        materialsList: [{}]
    };
} else {
    responseData = {
        code: "00",
        message: "无广告返回"
    };
}

// 兼容 Quantumult X 与其他代理工具的返回格式
if (typeof $task !== "undefined") {
    // Quantumult X 格式
    $done({ body: JSON.stringify(responseData) });
} else {
    // Surge / Loon 格式
    $done({ response: { body: JSON.stringify(responseData) } });
}
