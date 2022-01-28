/*!
 * Bravo for Power BI
 * Copyright (c) SQLBI corp. - All rights reserved.
 * https://www.sqlbi.com
*/

import { Dispatchable } from '../helpers/dispatchable';
import { Dic, Utils } from '../helpers/utils';
import { auth, debug, telemetry } from '../main';
import { DocType } from '../model/doc';
import { AppError, AppErrorType, AppProblem } from '../model/exceptions';
import { /*TokenUpdateWebMessage,*/ WebMessage } from '../model/message';
import { PBICloudDataset, PBICloudDatasetConnectionMode } from '../model/pbi-dataset';
import { FormattedMeasure, TabularDatabase, TabularMeasure } from '../model/tabular';
import { Account } from './auth';
import { FormatDaxOptions, Options } from './options';
import { PBIDesktopReport, PBIDesktopReportConnectionMode } from '../model/pbi-report';
import { ThemeType } from './theme';
import { i18n } from '../model/i18n';
import { strings } from '../model/strings';

declare global {
    
    interface External {
        receiveMessage(callback: { (message: any): void }): void
        sendMessage(message: any): void
    }
}

interface ApiRequest {
    action: string
    controller: AbortController
    timeout?: number
    aborted?: Utils.RequestAbortReason
}

export interface ProblemDetails {
    type?: string
    title?:	string
    status?: number
    detail?: string
    instance?: string
    traceId?: string
}

export interface FormatDaxRequest {
    options: FormatDaxOptions
    measures: TabularMeasure[]
}

export interface UpdatePBIDesktopReportRequest{
    report: PBIDesktopReport
    measures: FormattedMeasure[]
}

export interface UpdatePBICloudDatasetRequest{
    dataset: PBICloudDataset
    measures: FormattedMeasure[]
}

export interface DatabaseUpdateResult {
    etag?: string
}

export interface FileActionResult {
    path?: string
    canceled?: boolean
}

export class Host extends Dispatchable {

    static DEFAULT_TIMEOUT = 60 * 1000;

    address: string;
    token: string;
    requests: Dic<ApiRequest>;

    constructor(address: string, token: string) {
        super();
        this.listen();
        this.requests = {};
        this.address = address;
        this.token = token;
    }   

    // Listen for events
    listen() {
        try {
            window.external.receiveMessage(message => {

                const webMessage = <WebMessage>JSON.parse(message);
                if (!webMessage || !("type" in webMessage)) return;
                console.log("WebMessage Received", webMessage);
                this.trigger(webMessage.type, webMessage);
            });
        } catch (error) {
            // Ignore error
        }

        /*this.on(WebMessageType.TokenUpdate, (data: TokenUpdateWebMessage) => {
            this.token = data.token;
        });*/
    }

    // Send message to host
    send(message: any) {
        try {
            window.external.sendMessage(message);
        } catch (e) {
            // Ignore error
        }
    }

    // Functions
    apiCall(action: string, data = {}, options: RequestInit = {}, signinIfRequired = true, timeout = Host.DEFAULT_TIMEOUT): Promise<any> {

        let debugResponse = debug.catchApiCall(action, data);
        if (debugResponse !== null) return debugResponse;

        let requestId = Utils.Text.uuid();
        let abortController = new AbortController();
        this.requests[requestId] = {
            action: action,
            controller: abortController
        };

        if (!("method" in options))
            options["method"] = "GET";
        
        options["signal"] = abortController.signal;

        if (timeout) {
            this.requests[requestId].timeout = window.setTimeout(()=> {
                this.apiAbortById(requestId, "timeout");
            }, timeout);
        }

        return Utils.Request.ajax(`${this.address}${action}`, data, options, this.token)
            .catch(async (response: Response | Error) => {

                let problem;

                //Catch unhandled errors, like an aborted request
                if (response instanceof Error) {

                    let status = Utils.ResponseStatusCode.InternalError;
                    if (Utils.Request.isAbort(response)) {
                        if (requestId in this.requests && this.requests[requestId].aborted == "timeout")
                            status = Utils.ResponseStatusCode.Timeout;
                        else 
                            status = Utils.ResponseStatusCode.Aborted;
                    }

                    problem = {
                        status: status,
                        title: response.message
                    }
                } else {
                    problem = await response.json(); 
                }

                let error = AppError.InitFromProblem(problem);

                if (error.type == AppErrorType.Auth && signinIfRequired) {

                    //Remove the timeout because the call will be re-executed
                    this.apiCallCompleted(requestId); 

                    return auth.signIn()
                        .then(()=>{
                            return this.apiCall(action, data, options, false, timeout);
                        })
                        .catch(error => {
                            throw error;
                        });

                } else {
                    throw error;
                }
            })
            .finally(()=>{
                this.apiCallCompleted(requestId);
            });
    }

    apiCallCompleted(requestId: string) {
        if (requestId in this.requests) {
            if ("timeout" in this.requests[requestId])
                window.clearTimeout(this.requests[requestId].timeout);
                
            delete this.requests[requestId];
        }
    }

    apiAbortById(requestId: string, reason: Utils.RequestAbortReason = "user") {
        if (requestId in this.requests) {
            try {
                this.requests[requestId].aborted = reason;
                this.requests[requestId].controller.abort();
            } catch (e){}
        }
    }

    apiAbortByAction(actions: string | string[], reason: Utils.RequestAbortReason = "user") {
        for (let requestId in this.requests) {
            if (Utils.Obj.isArray(actions) ? actions.indexOf(this.requests[requestId].action) >= 0 : actions == this.requests[requestId].action) {
                this.apiAbortById(requestId, reason);
                console.log(`${this.requests[requestId].action} aborted with reason "${reason}".`);
            }
        }
    }

    /**** APIs ****/

    /* Authentication */
    signIn(emailAddress?: string) {
        return <Promise<Account>>this.apiCall("auth/powerbi/SignIn", emailAddress ? { upn: emailAddress } : {}, {}, false);
    }

    signOut() {
        return this.apiCall("auth/powerbi/SignOut", {}, {}, false);
    }

    getUser() {
        return <Promise<Account>>this.apiCall("auth/GetUser", {}, {}, false);
    }

    getUserAvatar() {
        return <Promise<string>>this.apiCall("auth/GetUserAvatar", {}, {}, false);
    }


    /* Analyze Model */

    getModelFromVpax(file: File) {
        return <Promise<TabularDatabase>>this.apiCall("api/GetModelFromVpax", file, { method: "POST", headers: { /* IMPORTANT */ } }); 
    }

    getModelFromReport(report: PBIDesktopReport)  {
        return this.validateReportConnection(report)
            .then(report => {
                return <Promise<TabularDatabase>>this.apiCall("api/GetModelFromReport", report, { method: "POST" });
            });
    }

    validateReportConnection(report: PBIDesktopReport): Promise<PBIDesktopReport> {

        const connectionError = (connectionMode: PBIDesktopReportConnectionMode) => {
            let errorKey = `errorReportConnection${PBIDesktopReportConnectionMode[connectionMode]}`;
            let message = i18n(errorKey in strings ? (<any>strings)[errorKey] : strings.errorConnectionUnsupported);

            return AppError.InitFromProblemCode(AppProblem.ConnectionUnsupported, message);
        };

        return new Promise((resolve, reject) => {
            if (report.connectionMode == PBIDesktopReportConnectionMode.Supported) {
                resolve(report);
            } else {
                reject(connectionError(report.connectionMode));
            }
        });
    }

    getModelFromDataset(dataset: PBICloudDataset) {
        return this.validateDatasetConnection(dataset)
            .then(dataset => {
                return <Promise<TabularDatabase>>this.apiCall("api/GetModelFromDataset", dataset, { method: "POST" });
            });
    }
    validateDatasetConnection(dataset: PBICloudDataset): Promise<PBICloudDataset> {

        const connectionError = (connectionMode: PBICloudDatasetConnectionMode, diagnostic?: any) => {
            let errorKey = `errorDatasetConnection${PBICloudDatasetConnectionMode[connectionMode]}`;
            let message = i18n(errorKey in strings ? (<any>strings)[errorKey] : strings.errorConnectionUnsupported);
            let details = (diagnostic ? JSON.stringify(diagnostic) : null);

            return AppError.InitFromProblemCode(AppProblem.ConnectionUnsupported, message, details);
        };

        return new Promise((resolve, reject) => {
            if (dataset.connectionMode == PBICloudDatasetConnectionMode.Supported) {
                resolve(dataset);
            } else {
                
                if (dataset.connectionMode == PBICloudDatasetConnectionMode.Unknown) {
                    this.listDatasets()
                        .then((datasets: PBICloudDataset[]) => {
                            for (let i = 0; i < datasets.length; i++) {
                                if (datasets[i].databaseName == dataset.databaseName) {
                                    if (datasets[i].connectionMode == PBICloudDatasetConnectionMode.Supported) {
                                        resolve(datasets[i]);
                                    }
                                    break;
                                }
                            }
                            reject(connectionError(dataset.connectionMode, dataset.diagnostic));
                        })
                        .catch(error => {
                            reject(error);
                        });
                } else {
                    reject(connectionError(dataset.connectionMode, dataset.diagnostic));
                }
            }
        });
    }

    listReports(verifyConnections: boolean) {
        return <Promise<PBIDesktopReport[]>>this.apiCall(`api/${verifyConnections ? "ListReports" : "QueryReports"}`);
    }

    listDatasets() {
        return <Promise<PBICloudDataset[]>>this.apiCall("api/ListDatasets");
    }

    exportVpax(datasource: PBIDesktopReport | PBICloudDataset, type: DocType) {
        return <Promise<FileActionResult>>this.apiCall(`api/ExportVpaxFrom${type == DocType.dataset ? "Dataset" : "Report"}`, datasource, { method: "POST" });
    }
    abortExportVpax(type: DocType) {
        this.apiAbortByAction(`api/ExportVpaxFrom${type == DocType.dataset ? "Dataset" : "Report"}`);
    }

    /* Format DAX */

    formatDax(request: FormatDaxRequest) {
        return <Promise<FormattedMeasure[]>>this.apiCall("api/FormatDax", request, { method: "POST" });
    }
    abortFormatDax(type: DocType) {
        this.apiAbortByAction(["api/FormatDax", `api/Update${type == DocType.dataset ? "Dataset" : "Report"}`]);
    }

    updateModel(request: UpdatePBIDesktopReportRequest | UpdatePBICloudDatasetRequest, type: DocType) {
        return <Promise<DatabaseUpdateResult>>this.apiCall(`api/Update${type == DocType.dataset ? "Dataset" : "Report"}`, request, { method: "POST" });
    }

    /* Application */

    changeTheme(theme: ThemeType) {
        return this.apiCall("api/ChangeTheme", { theme: theme });
    }

    getOptions() {
        return <Promise<Options>>this.apiCall("api/GetOptions");
    }

    updateOptions(options: Options) {
        return this.apiCall("api/UpdateOptions", options, { method: "POST" });
    }

    navigateTo(url: string) {
        return this.apiCall("api/NavigateTo", { address: url });
    }

}