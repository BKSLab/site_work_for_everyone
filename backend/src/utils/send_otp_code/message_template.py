VERIFICATION_MESSAGE = """
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Код подтверждения — Работа для всех</title>
</head>
<body style="margin:0;padding:0;background-color:#0A0A0A;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">

    <!--
        Preheader — краткий текст в превью письма (скрыт визуально)
    -->
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
        Ваш код подтверждения: {otp_code} — действителен 10 минут.
    </div>
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
        &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
    </div>

    <!-- Внешняя обёртка -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0A0A0A">
        <tr>
            <td align="center" style="padding:40px 16px;">

                <!-- Карточка письма -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0"
                       style="max-width:560px;background-color:#111111;border-radius:16px;border:1px solid #2D2800;">

                    <!-- Жёлтая полоска сверху -->
                    <tr>
                        <td height="3" style="background-color:#F5B800;border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td>
                    </tr>

                    <!-- Шапка: Вера -->
                    <tr>
                        <td align="center" style="padding:36px 40px 28px;">
                            <p style="margin:0 0 16px;font-size:11px;letter-spacing:5px;text-transform:uppercase;color:#7A5E00;font-family:Arial,sans-serif;">
                                Работа для всех
                            </p>
                            <!-- Фото + имя в одну строку -->
                            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                                <tr>
                                    <td style="padding-right:14px;vertical-align:middle;">
                                        <img src="cid:vera_avatar" alt="Вера" width="72" height="72"
                                             style="display:block;border-radius:50%;border:2px solid #F5B800;box-shadow:0 0 18px rgba(245,184,0,0.30);" />
                                    </td>
                                    <td style="vertical-align:middle;text-align:left;">
                                        <p style="margin:0;font-size:32px;font-weight:900;color:#F5B800;letter-spacing:0.04em;line-height:1;">
                                            Вера
                                        </p>
                                        <p style="margin:5px 0 0;font-size:11px;color:#555555;letter-spacing:3px;text-transform:uppercase;">
                                            карьерный консультант
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Разделитель -->
                    <tr>
                        <td style="padding:0 40px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr><td height="1" bgcolor="#222222" style="font-size:0;line-height:0;">&nbsp;</td></tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Основное содержимое -->
                    <tr>
                        <td style="padding:32px 40px 8px;">

                            <p style="margin:0 0 16px;font-size:16px;color:#F5F5F5;line-height:1.5;">
                                Здравствуйте, <strong style="color:#F5B800;">{user_name}</strong>!
                            </p>
                            <p style="margin:0 0 28px;font-size:15px;color:#888888;line-height:1.7;">
                                Спасибо за регистрацию. Для подтверждения электронной почты введите код ниже:
                            </p>

                            <!-- Блок с OTP-кодом -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td align="center" style="padding-bottom:24px;">
                                        <table cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                                <td align="center"
                                                    style="background-color:#1A1A1A;border-radius:12px;border:1px solid #2D2800;padding:20px 40px;">
                                                    <span style="font-family:Courier,monospace,serif;font-size:36px;font-weight:700;letter-spacing:12px;color:#F5B800;">{otp_code}</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:0 0 32px;font-size:14px;color:#555555;text-align:center;line-height:1.5;">
                                Код действителен <strong style="color:#888888;">10 минут</strong>.
                                Не передавайте его никому.
                            </p>

                            <!-- Блок про Веру -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td style="background-color:#171700;border-radius:12px;border:1px solid #2D2800;padding:18px 20px;">
                                        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#F5B800;">
                                            Карьерный консультант Вера
                                        </p>
                                        <p style="margin:0;font-size:13px;color:#777777;line-height:1.6;">
                                            После входа вам будет доступен персональный карьерный консультант. Вера поможет составить
                                            сопроводительное письмо и адаптировать резюме под каждую вакансию.
                                        </p>
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>

                    <!-- Разделитель -->
                    <tr>
                        <td style="padding:28px 40px 0;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr><td height="1" bgcolor="#1A1A1A" style="font-size:0;line-height:0;">&nbsp;</td></tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Подвал -->
                    <tr>
                        <td align="center" style="padding:24px 40px 32px;">
                            <p style="margin:0 0 6px;font-size:12px;color:#444444;line-height:1.7;">
                                Вы получили это письмо, так как зарегистрировались на сайте<br>
                                «Работа для всех» — поиск вакансий для людей с инвалидностью в России.
                            </p>
                            <p style="margin:0;font-size:12px;color:#333333;">
                                &copy; 2026 Работа для всех
                            </p>
                        </td>
                    </tr>

                </table>
                <!-- /Карточка -->

            </td>
        </tr>
    </table>

</body>
</html>
"""

FEEDBACK_MESSAGE = """
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Обратная связь — Работа для всех</title>
</head>
<body style="margin:0;padding:0;background-color:#0A0A0A;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">

    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
        Новое сообщение от пользователя сайта «Работа для всех».
    </div>
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
        &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0A0A0A">
        <tr>
            <td align="center" style="padding:40px 16px;">

                <table width="100%" cellpadding="0" cellspacing="0" border="0"
                       style="max-width:560px;background-color:#111111;border-radius:16px;border:1px solid #2D2800;">

                    <tr>
                        <td height="3" style="background-color:#F5B800;border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td>
                    </tr>

                    <tr>
                        <td align="center" style="padding:36px 40px 28px;">
                            <p style="margin:8px 0 0;font-size:20px;font-weight:700;color:#F5F5F5;letter-spacing:0.02em;">
                                Работа для всех
                            </p>
                            <p style="margin:6px 0 0;font-size:13px;color:#7A5E00;">
                                Форма обратной связи
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:0 40px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr><td height="1" bgcolor="#222222" style="font-size:0;line-height:0;">&nbsp;</td></tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:32px 40px 8px;">

                            <p style="margin:0 0 20px;font-size:15px;color:#888888;line-height:1.7;">
                                Новое сообщение с сайта:
                            </p>

                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td style="background-color:#171700;border-radius:12px;border:1px solid #2D2800;padding:20px 24px;">
                                        <p style="margin:0;font-size:15px;color:#F5F5F5;line-height:1.8;white-space:pre-wrap;">{message}</p>
                                    </td>
                                </tr>
                            </table>

                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
                                <tr>
                                    <td style="padding:16px 20px;background-color:#0F0F0F;border-radius:10px;border:1px solid #1E1E1E;">
                                        <p style="margin:0 0 8px;font-size:12px;color:#555555;text-transform:uppercase;letter-spacing:1px;">Детали</p>
                                        <p style="margin:0 0 6px;font-size:13px;color:#777777;">
                                            <span style="color:#555555;">Ответить:</span>&nbsp;
                                            <span style="color:#F5B800;">{reply_email}</span>
                                        </p>
                                        <p style="margin:0;font-size:13px;color:#777777;">
                                            <span style="color:#555555;">Страница:</span>&nbsp;
                                            <span style="color:#888888;">{page}</span>
                                        </p>
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>

                    <tr>
                        <td style="padding:28px 40px 0;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr><td height="1" bgcolor="#1A1A1A" style="font-size:0;line-height:0;">&nbsp;</td></tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding:24px 40px 32px;">
                            <p style="margin:0;font-size:12px;color:#333333;">
                                &copy; 2026 Работа для всех
                            </p>
                        </td>
                    </tr>

                </table>

            </td>
        </tr>
    </table>

</body>
</html>
"""

PASSWORD_RESET_MESSAGE = """
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Сброс пароля — Работа для всех</title>
</head>
<body style="margin:0;padding:0;background-color:#0A0A0A;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">

    <!--
        Preheader — краткий текст в превью письма (скрыт визуально)
    -->
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
        Код для сброса пароля: {otp_code} — действителен 10 минут.
    </div>
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
        &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
    </div>

    <!-- Внешняя обёртка -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0A0A0A">
        <tr>
            <td align="center" style="padding:40px 16px;">

                <!-- Карточка письма -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0"
                       style="max-width:560px;background-color:#111111;border-radius:16px;border:1px solid #2D2800;">

                    <!-- Жёлтая полоска сверху -->
                    <tr>
                        <td height="3" style="background-color:#F5B800;border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td>
                    </tr>

                    <!-- Шапка: Вера -->
                    <tr>
                        <td align="center" style="padding:36px 40px 28px;">
                            <p style="margin:0 0 16px;font-size:11px;letter-spacing:5px;text-transform:uppercase;color:#7A5E00;font-family:Arial,sans-serif;">
                                Работа для всех
                            </p>
                            <!-- Фото + имя в одну строку -->
                            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                                <tr>
                                    <td style="padding-right:14px;vertical-align:middle;">
                                        <img src="cid:vera_avatar" alt="Вера" width="72" height="72"
                                             style="display:block;border-radius:50%;border:2px solid #F5B800;box-shadow:0 0 18px rgba(245,184,0,0.30);" />
                                    </td>
                                    <td style="vertical-align:middle;text-align:left;">
                                        <p style="margin:0;font-size:32px;font-weight:900;color:#F5B800;letter-spacing:0.04em;line-height:1;">
                                            Вера
                                        </p>
                                        <p style="margin:5px 0 0;font-size:11px;color:#555555;letter-spacing:3px;text-transform:uppercase;">
                                            карьерный консультант
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Разделитель -->
                    <tr>
                        <td style="padding:0 40px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr><td height="1" bgcolor="#222222" style="font-size:0;line-height:0;">&nbsp;</td></tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Основное содержимое -->
                    <tr>
                        <td style="padding:32px 40px 8px;">

                            <p style="margin:0 0 16px;font-size:16px;color:#F5F5F5;line-height:1.5;">
                                Здравствуйте, <strong style="color:#F5B800;">{user_name}</strong>!
                            </p>
                            <p style="margin:0 0 28px;font-size:15px;color:#888888;line-height:1.7;">
                                Вы запросили сброс пароля на портале «Работа для всех».
                                Введите код ниже для создания нового пароля:
                            </p>

                            <!-- Блок с OTP-кодом -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td align="center" style="padding-bottom:24px;">
                                        <table cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                                <td align="center"
                                                    style="background-color:#1A1A1A;border-radius:12px;border:1px solid #2D2800;padding:20px 40px;">
                                                    <span style="font-family:Courier,monospace,serif;font-size:36px;font-weight:700;letter-spacing:12px;color:#F5B800;">{otp_code}</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:0 0 32px;font-size:14px;color:#555555;text-align:center;line-height:1.5;">
                                Код действителен <strong style="color:#888888;">10 минут</strong>.
                                Не передавайте его никому.
                            </p>

                            <!-- Предупреждение безопасности -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td style="background-color:#150A0A;border-radius:12px;border:1px solid #3D1010;padding:18px 20px;">
                                        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#E05555;">
                                            Не вы запрашивали сброс?
                                        </p>
                                        <p style="margin:0;font-size:13px;color:#777777;line-height:1.6;">
                                            Проигнорируйте это письмо — ваш пароль останется прежним.
                                            Если вы не делали этот запрос, рекомендуем убедиться,
                                            что ваш аккаунт в безопасности.
                                        </p>
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>

                    <!-- Разделитель -->
                    <tr>
                        <td style="padding:28px 40px 0;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr><td height="1" bgcolor="#1A1A1A" style="font-size:0;line-height:0;">&nbsp;</td></tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Подвал -->
                    <tr>
                        <td align="center" style="padding:24px 40px 32px;">
                            <p style="margin:0 0 6px;font-size:12px;color:#444444;line-height:1.7;">
                                Вы получили это письмо, так как запросили сброс пароля на сайте<br>
                                «Работа для всех» — поиск вакансий для людей с инвалидностью в России.
                            </p>
                            <p style="margin:0;font-size:12px;color:#333333;">
                                &copy; 2026 Работа для всех
                            </p>
                        </td>
                    </tr>

                </table>
                <!-- /Карточка -->

            </td>
        </tr>
    </table>

</body>
</html>
"""
