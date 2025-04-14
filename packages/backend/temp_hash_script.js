// 临时脚本：用于生成 bcrypt 密码哈希
    // 使用方法: node packages/backend/temp_hash_script.js

    const bcrypt = require('bcrypt');
    const saltRounds = 10; // 标准加盐轮数，安全性与性能的平衡点
    const plainPassword = 'adminpassword'; // 在这里替换为您想设置的管理员密码

    if (!plainPassword) {
        console.error("错误：请在脚本中设置 'plainPassword' 变量的值。");
        process.exit(1);
    }

    console.log(`正在为密码 "${plainPassword}" 生成哈希...`);

    bcrypt.hash(plainPassword, saltRounds, function(err, hash) {
        if (err) {
            console.error("生成哈希时出错:", err);
            return;
        }
        console.log("------------------------------------------------------");
        console.log("请将以下哈希值复制到数据库中:");
        console.log("BCrypt 哈希:", hash);
        console.log("------------------------------------------------------");
        console.log("重要提示：请妥善保管您的原始密码，此脚本仅用于生成初始哈希。");
    });
