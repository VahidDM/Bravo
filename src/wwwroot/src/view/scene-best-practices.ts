/*!
 * Bravo for Power BI
 * Copyright (c) SQLBI corp. - All rights reserved.
 * https://www.sqlbi.com
*/
import { Page, PageType } from '../controllers/page';
import { Doc } from '../model/doc';
import { i18n } from '../model/i18n';
import { strings } from '../model/strings';
import { MainScene } from './scene-main';

export class BestPracticesScene extends MainScene {

    constructor(id: string, container: HTMLElement, doc: Doc, type: PageType) {
        super(id, container, doc, type);
        this.path = `/${i18n(strings.BestPractices)}`;
        
        this.element.classList.add("best-practices");
    }

    render() {
        if (!super.render()) return false;
        
        let html = `

        `;
        this.body.insertAdjacentHTML("beforeend", html);
    }
}