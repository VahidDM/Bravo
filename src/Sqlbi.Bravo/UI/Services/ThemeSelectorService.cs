﻿using ControlzEx.Theming;
using MahApps.Metro.Theming;
using Sqlbi.Bravo.UI.Services.Interfaces;
using System;
using System.Windows;

namespace Sqlbi.Bravo.UI.Services
{
    public class ThemeSelectorService : IThemeSelectorService
    {
        public ThemeSelectorService()
        {
        }

        public void InitializeTheme(string themeName) => SetTheme(themeName);

        public void SetTheme(string themeName)
        {
            System.Diagnostics.Debug.WriteLine($"Settings theme to '{themeName}'");
            if (themeName.Equals("Default", StringComparison.InvariantCultureIgnoreCase))
            {
                // Forcibly match the system theme
                // Relying on `ThemeSyncMode.SyncWithAppMode` won't pick up the custom themes on first launch
                SetTheme(WindowsThemeHelper.GetWindowsBaseColor());
            }
            else
            {
                ThemeManager.Current.ThemeSyncMode = ThemeSyncMode.SyncWithAccent;
                ThemeManager.Current.SyncTheme();
                ThemeManager.Current.ChangeTheme(Application.Current, $"{themeName}.Red");
            }
        }
    }
}