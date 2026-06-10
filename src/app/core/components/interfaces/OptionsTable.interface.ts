export interface Options {
    label:    string,
    icon:     string, 
    class:    string,
    tooltip?: string,
    disabled?: boolean,
    style?:    string,
    eventClick?: Function;
}

export interface ColsTable {
    field?:      string | string[];
    field2?:     string | string[];
    link?:     string;
    footer?:     string;
    header:     string;
    style?:      string;
    tooltip?:   boolean;
    tooltipMsg?: string;
    isArray?:   boolean;
    isDate?:    boolean;
    widthTable?:string;
    isNotDateAndHour?:boolean;
    isConcat?:  boolean;
    colsChild?: ColsChild[];
    isButton?:  boolean;
    isImg?:     boolean;
    isText?:     boolean;
    isTextArray?:     boolean;
    isDoubleValue?:  boolean;
    isLink?:     boolean;
    isValueUpdate?: boolean;
    typeImg?:   string;
    toImg?:     string;
    isTag?:     boolean;
    activeSortable?: boolean;
    class?: string;
    tagColor?:Function;
    tagColorPersonalizado?:Function;
    tagValue?:Function;
    tagIcon?:Function;
    isIndex?:   boolean;
}

export interface ColsChild {
    field:  string;
    header: string;
}


export interface SearchFor { 
    name: string; 
    code: string; 
}

export interface Paginate {
    from:  number;
    rows:  number;
    to:    number; 
    total: number;
}
