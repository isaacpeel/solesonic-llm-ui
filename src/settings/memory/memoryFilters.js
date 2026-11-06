import {useState} from "react";
import {useSearchParams} from "react-router";

export const selectedFilterValues = (searchParams, name, allValues) => {
    const requestedValues = searchParams.getAll(name);
    const selectedValues = allValues.filter((value) => requestedValues.includes(value));

    return selectedValues.length > 0 ? selectedValues : allValues;
};

export const subsetOrNone = (selectedValues, allValues) => {
    return selectedValues.length < allValues.length ? selectedValues : [];
};

export const toggledFilterValues = (selectedValues, allValues, value) => {
    const nextValues = selectedValues.includes(value)
        ? selectedValues.filter((candidate) => candidate !== value)
        : allValues.filter((candidate) => candidate === value || selectedValues.includes(candidate));

    return nextValues.length > 0 ? nextValues : null;
};

export const useMemorySearchParams = (sortOptions) => {
    const [searchParams, setSearchParams] = useSearchParams();

    const userIdFilter = searchParams.get("userId") ?? "";
    const sortOption = sortOptions.find((option) => option.value === searchParams.get("sort")) ?? sortOptions[0];

    const [userIdInput, setUserIdInput] = useState(userIdFilter);
    const [syncedUserIdFilter, setSyncedUserIdFilter] = useState(userIdFilter);

    if (syncedUserIdFilter !== userIdFilter) {
        setSyncedUserIdFilter(userIdFilter);
        setUserIdInput(userIdFilter);
    }

    const updateSearchParams = (mutate) => {
        setSearchParams((currentSearchParams) => {
            const nextSearchParams = new URLSearchParams(currentSearchParams);
            mutate(nextSearchParams);
            return nextSearchParams;
        });
    };

    const applyUserId = (userId) => {
        updateSearchParams((nextSearchParams) => {
            if (userId) {
                nextSearchParams.set("userId", userId);
            } else {
                nextSearchParams.delete("userId");
            }
        });
    };

    const changeSort = (value) => {
        updateSearchParams((nextSearchParams) => {
            if (value === sortOptions[0].value) {
                nextSearchParams.delete("sort");
            } else {
                nextSearchParams.set("sort", value);
            }
        });
    };

    const toggleFilter = (name, selectedValues, allValues, value) => {
        const nextValues = toggledFilterValues(selectedValues, allValues, value);

        if (nextValues === null) {
            return;
        }

        updateSearchParams((nextSearchParams) => {
            nextSearchParams.delete(name);
            subsetOrNone(nextValues, allValues).forEach((nextValue) => nextSearchParams.append(name, nextValue));
        });
    };

    return {
        searchParams,
        userIdFilter,
        sortOption,
        userIdInput,
        setUserIdInput,
        applyUserId,
        changeSort,
        toggleFilter,
    };
};
