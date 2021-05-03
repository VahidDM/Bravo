﻿using Microsoft.Identity.Client;
using Sqlbi.Bravo.Client.PowerBI;
using Sqlbi.Bravo.Client.PowerBI.PowerBICloud;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Sqlbi.Bravo.Core.Services.Interfaces
{
    internal interface IPowerBICloudService
    {
        PowerBICloudEnvironment CloudEnvironment { get; }

        bool IsAuthenticated { get; }

        IAccount Account { get; }
        
        string AccessToken { get; }

        Task<bool> LoginAsync();

        Task LogoutAsync(); 

        Task<IEnumerable<PowerBICloudSharedDataset>> GetDatasetsAsync();
    }
}